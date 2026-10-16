import { describe, expect, it } from 'vitest'
import { collectIssues, speedMbps } from './issues'
import { createEmptyProject, type Project } from './schema'
import { reportIssues } from './report'

function fixture(): Project {
  const p = createEmptyProject()
  p.addressSpaces = [{ id: 'space', name: 'Office', scope: 'HQ', parentCidr: '10.0.0.0/16' }]
  p.vlans = [{ id: 'vlan', name: 'Staff', number: 10 }, { id: 'vlan2', name: 'Guest', number: 20 }]
  p.subnets = [{ id: 'subnet', name: 'Staff', cidr: '10.0.0.0/24', addressSpaceId: 'space', hostRequirement: 100, gatewayIp: '10.0.0.1', vlanId: 'vlan', source: 'manual', status: 'allocated', notes: '' }]
  p.devices = ['a', 'b'].map((id) => ({ id, name: id, role: 'switch', scope: 'HQ', notes: '', hardwareItemId: null }))
  p.ports = ['pa', 'pb'].map((id, i) => ({ id, name: 'eth0', deviceId: i ? 'b' : 'a', speed: '1 Gbps', media: 'copper', mode: 'access', accessVlanId: 'vlan', trunkVlanIds: [] }))
  p.interfaces = ['ia', 'ib'].map((id, i) => ({ id, name: 'LAN', deviceId: i ? 'b' : 'a', kind: 'physical', portId: i ? 'pb' : 'pa', vlanId: 'vlan', address: `10.0.0.${i + 1}/24` }))
  p.links = [{ id: 'link', sourcePortId: 'pa', targetPortId: 'pb', cableType: 'Cat6', label: 'Office uplink' }]
  p.hardwareItems = [{ id: 'hw', model: 'Switch', category: 'Switch', portCount: 1, quantityAvailable: 2, unitCost: 10, capabilities: ['VLANs', 'role:switch', 'media:copper', 'mode:access', 'speed:1gbps'] }]
  p.allocations = p.devices.map((d) => ({ id: `alloc-${d.id}`, deviceId: d.id, hardwareItemId: 'hw', scope: null, quantity: 1 }))
  return p
}
const codes = (p: Project) => collectIssues(p).map((i) => i.code)

describe('network issue engine', () => {
  it('has no invented findings on an empty or coherent project, including its declared gateway interface', () => {
    expect(collectIssues(createEmptyProject())).toEqual([])
    expect(collectIssues(fixture())).toEqual([])
  })
  it('shares report results, stable IDs, severity ordering, entity targets, and repair text', () => {
    const p = fixture(); p.interfaces[1]!.address = p.interfaces[0]!.address; p.hardwareItems[0]!.quantityAvailable = 0
    const findings = collectIssues(p)
    expect(findings.map((i) => i.id)).toEqual(collectIssues(structuredClone(p)).map((i) => i.id))
    expect(findings[0]!.code).toBe('duplicate-ip')
    expect(findings[0]!.entities).toEqual([{ entityType: 'interface', id: 'ia' }, { entityType: 'interface', id: 'ib' }])
    expect(findings.every((i) => i.repair.length > 0)).toBe(true)
    expect(reportIssues(p)).toEqual(findings.map((i) => `${i.severity === 'error' ? 'Error' : 'Warning'}: ${i.message}`))
  })
  it('allows duplicate IPs in separate routing scopes but reports same-scope duplicates regardless of prefix', () => {
    const p = fixture(); p.interfaces[1]!.address = '10.0.0.1/25'
    expect(codes(p)).toContain('duplicate-ip')
    p.devices[1]!.scope = 'Branch'
    expect(codes(p)).not.toContain('duplicate-ip')
  })
  it('finds subnet invariants, cross-space overlaps only in a shared scope, and missing references', () => {
    const p = fixture(); p.subnets[0]!.hostRequirement = 300
    p.addressSpaces.push({ ...p.addressSpaces[0]!, id: 'space2' })
    p.subnets.push({ ...p.subnets[0]!, id: 'subnet2', addressSpaceId: 'space2', vlanId: null })
    expect(codes(p)).toEqual(expect.arrayContaining(['subnet-invalid', 'subnet-overlap']))
    p.addressSpaces[1]!.scope = 'Branch'; expect(codes(p)).not.toContain('subnet-overlap')
    p.subnets[1]!.addressSpaceId = 'missing'; expect(codes(p)).toContain('reference')
  })
  it('finds duplicate VLAN numbers and multiple subnet assignments', () => {
    const p = fixture(); p.vlans[1]!.number = 10; p.subnets.push({ ...p.subnets[0]!, id: 'second', cidr: '10.0.1.0/24' })
    expect(codes(p)).toEqual(expect.arrayContaining(['vlan-number', 'vlan-subnets']))
  })
  it('finds unset access/trunk VLANs, mode inconsistencies, repeated VLANs and port names', () => {
    const p = fixture(); p.ports[0]!.accessVlanId = null; p.ports[0]!.trunkVlanIds = ['vlan', 'vlan']
    p.ports[1]!.mode = 'trunk'; p.ports[1]!.deviceId = 'a'
    expect(codes(p)).toEqual(expect.arrayContaining(['access-vlan', 'trunk-vlans', 'port-mode', 'trunk-duplicate', 'port-name']))
  })
  it('finds interface names, shared physical ports, virtual port assignments and absent VLANs', () => {
    const p = fixture(); p.interfaces[1] = { ...p.interfaces[0]!, id: 'ib' }
    expect(codes(p)).toEqual(expect.arrayContaining(['interface-name', 'interface-port']))
    p.interfaces[1]!.kind = 'SVI'; p.interfaces[1]!.vlanId = null
    expect(codes(p)).toEqual(expect.arrayContaining(['virtual-port', 'interface-vlan']))
    p.interfaces[1]!.kind = 'loopback'; p.interfaces[1]!.vlanId = 'vlan'
    expect(codes(p)).toContain('loopback-vlan')
  })
  it.each(['unused', 'access', 'trunk'] as const)('finds interface conflict with %s port mode', (mode) => {
    const p = fixture(); p.ports[0]!.mode = mode; p.ports[0]!.accessVlanId = 'vlan2'; p.ports[0]!.trunkVlanIds = ['vlan2']
    expect(codes(p)).toContain('interface-port-mode')
  })
  it('finds network and broadcast IPs, different masks, outside/reserved assignments, and usable-address mismatches', () => {
    const p = fixture(); p.interfaces[0]!.address = '10.0.0.0/24'
    expect(codes(p)).toContain('interface-host')
    p.interfaces[0]!.address = '10.0.0.255/16'; expect(codes(p)).toEqual(expect.arrayContaining(['subnet-host', 'interface-prefix']))
    p.interfaces[0]!.address = '10.0.1.1/24'; expect(codes(p)).toContain('interface-outside')
    p.interfaces[0]!.address = '10.0.0.1/25'; p.subnets[0]!.status = 'reserved'
    expect(codes(p)).toEqual(expect.arrayContaining(['interface-reserved', 'interface-prefix']))
    p.interfaces[0]!.kind = 'loopback'; expect(collectIssues(p).filter((i) => i.code === 'interface-prefix').some((i) => i.entities[0]!.id === 'ia')).toBe(false)
  })
  it('allows /31 point-to-point and /32 hosts without inventing broadcast errors', () => {
    const p = fixture(); p.subnets = []
    p.interfaces[0]!.address = '10.0.0.0/31'; p.interfaces[1]!.address = '10.0.1.1/32'
    expect(codes(p)).not.toContain('interface-host')
    p.interfaces[0]!.address = null; p.interfaces[1]!.deviceId = 'missing'; expect(new Set(codes(p))).toEqual(new Set(['reference']))
  })
  it('finds self/occupied/device-loop cables while skipping unresolved ends', () => {
    const p = fixture(); p.links.push({ ...p.links[0]!, id: 'zz', sourcePortId: 'pa', targetPortId: 'pa', label: '' })
    expect(codes(p)).toEqual(expect.arrayContaining(['cable-self', 'cable-occupied']))
    p.links[1]!.sourcePortId = 'missing'; expect(codes(p)).toContain('reference')
    p.ports[1]!.deviceId = 'a'; expect(codes(p)).toContain('cable-device-loop')
  })
  it('finds mismatched cable media, declared speeds, and unused ports; unknown cable/speed stays unknown', () => {
    const p = fixture(); p.ports[1]!.media = 'fiber'; p.ports[1]!.speed = '10 Gbps'; p.ports[0]!.mode = 'unused'
    expect(codes(p)).toEqual(expect.arrayContaining(['cable-media', 'cable-speed', 'cable-unused']))
    p.ports[0]!.media = 'fiber'; p.links[0]!.cableType = 'OM3'; expect(codes(p)).not.toContain('cable-media')
    p.links[0]!.cableType = 'custom'; p.ports[1]!.speed = 'auto'; expect(codes(p)).not.toContain('cable-speed')
    p.links[0]!.cableType = ''; p.links[0]!.label = ''; p.ports[1]!.mode = 'unused'; expect(codes(p)).toContain('cable-unused')
  })
  it('finds access/access, access/trunk, and disjoint trunk VLANs in either cable direction', () => {
    const p = fixture(); p.ports[1]!.accessVlanId = 'vlan2'; expect(codes(p)).toContain('cable-access-vlan')
    p.ports[1]!.mode = 'trunk'; p.ports[1]!.trunkVlanIds = ['vlan2']; expect(codes(p)).toContain('cable-trunk-vlan')
    p.links[0]!.sourcePortId = 'pb'; p.links[0]!.targetPortId = 'pa'; expect(codes(p)).toContain('cable-trunk-vlan')
    p.ports[0]!.mode = 'trunk'; p.ports[0]!.trunkVlanIds = ['vlan']; expect(codes(p)).toContain('cable-trunks')
    p.ports[1]!.trunkVlanIds = ['vlan']; expect(codes(p)).not.toContain('cable-trunks')
  })
  it('finds stock/port shortages and explicit role/media/mode/speed capability mismatches', () => {
    const p = fixture(); p.hardwareItems[0]!.quantityAvailable = 0; p.hardwareItems[0]!.portCount = 0
    p.hardwareItems[0]!.capabilities = ['role:router', 'media:fiber', 'mode:trunk', 'speed:10gbps', 'speed:unknown']
    p.devices[0]!.hardwareItemId = 'hw'
    expect(codes(p)).toEqual(expect.arrayContaining(['hardware-stock', 'hardware-ports', 'hardware-role', 'hardware-media', 'hardware-mode', 'hardware-speed']))
    p.hardwareItems[0]!.capabilities = ['unstructured description']
    expect(codes(p)).not.toContain('hardware-media')
    p.allocations = []; expect(codes(p)).not.toContain('hardware-ports')
  })
  it.each([['1 Gbps', 1000], ['1000mbps', 1000], ['100 Mbit/s', 100], ['1 Tbps', 1e6], ['1000 kbps', 1], ['1000000bps', 1], ['auto', null]])('normalizes speed %s', (input, expected) => expect(speedMbps(input as string)).toBe(expected))
})
