import { describe, expect, it } from 'vitest'
import { createEmptyProject, type Project } from './schema'
import { documentError, parseProjectJson, serializeProject, projectFilename, referenceIssues } from './document'
import { migrateProject } from './migrations'
import { reportIssues, reportAssumptions } from './report'

function fixture(): Project {
  const project = createEmptyProject('Office plan')
  project.addressSpaces = [{ id: 'space', name: 'Office', parentCidr: '10.0.0.0/24', scope: 'HQ' }]
  project.subnets = [{ id: 'subnet', name: 'Staff', addressSpaceId: 'space', cidr: '10.0.0.0/25', hostRequirement: 100, status: 'allocated', source: 'manual', gatewayIp: '10.0.0.1', vlanId: 'vlan', notes: 'Keep gateway' }]
  project.vlans = [{ id: 'vlan', name: 'Staff', number: 10 }]
  project.devices = [{ id: 'device', name: 'Core', role: 'switch', hardwareItemId: 'hardware', scope: 'HQ', notes: 'Device note' }, { id: 'device2', name: 'Edge', role: 'router', hardwareItemId: null, scope: 'HQ', notes: '' }]
  project.ports = ['port1', 'port2'].map((id, index) => ({ id, deviceId: index ? 'device2' : 'device', name: 'eth0', speed: '1 Gbps', media: 'copper', mode: 'access', accessVlanId: 'vlan', trunkVlanIds: ['vlan'] }))
  project.interfaces = [{ id: 'iface', deviceId: 'device', name: 'LAN', kind: 'physical', portId: 'port1', vlanId: 'vlan', address: '10.0.0.1/25' }]
  project.links = [{ id: 'link', sourcePortId: 'port1', targetPortId: 'port2', label: 'Uplink', cableType: 'Cat6' }]
  project.hardwareItems = [{ id: 'hardware', model: 'Switch model', category: 'Switch', portCount: 24, quantityAvailable: 1, unitCost: 125.5, capabilities: ['VLANs'] }]
  project.allocations = [{ id: 'allocation', hardwareItemId: 'hardware', deviceId: 'device', scope: null, quantity: 1 }]
  project.notes = [{ id: 'note', text: 'First line\nSecond line', attachedTo: { entityType: 'subnet', id: 'subnet' } }]
  project.checklistItems = [{ id: 'task', task: 'Check uplink', status: 'doing', attachedTo: { entityType: 'note', id: 'note' } }]
  project.layout = { physical: { device: { x: -50, y: 90 } }, logical: { 'iface:iface': { x: 600, y: 60 } } }
  return project
}

describe('project JSON boundary', () => {
  it('round-trips every collection, stable ID, timestamp, attachment and saved position', () => {
    const project = fixture()
    const text = serializeProject(project)
    expect(parseProjectJson(text)).toEqual(project)
    expect(text).toContain('\n  "')
    expect(referenceIssues(project)).toEqual([])
    expect(parseProjectJson(serializeProject(createEmptyProject())).devices).toEqual([])
  })

  it('rejects invalid syntax, missing or future versions, duplicate IDs and unknown properties', () => {
    expect(() => parseProjectJson('{')).toThrow('not valid JSON')
    expect(() => parseProjectJson('null')).toThrow()
    expect(() => parseProjectJson('{}')).toThrow()
    const project = fixture()
    expect(() => parseProjectJson(JSON.stringify({ ...project, schemaVersion: 2 }))).toThrow('Update netScratch')
    expect(() => parseProjectJson(JSON.stringify({ ...project, unexpected: true }))).toThrow()
    project.notes[0]!.id = 'device'
    expect(() => parseProjectJson(JSON.stringify(project))).toThrow('unique ID')
  })

  it.each([
    ['address space', (p: Project) => { p.subnets[0]!.addressSpaceId = 'missing' }],
    ['subnet VLAN', (p: Project) => { p.subnets[0]!.vlanId = 'missing' }],
    ['device model', (p: Project) => { p.devices[0]!.hardwareItemId = 'missing' }],
    ['port device', (p: Project) => { p.ports[0]!.deviceId = 'missing' }],
    ['access VLAN', (p: Project) => { p.ports[0]!.accessVlanId = 'missing' }],
    ['trunk VLAN', (p: Project) => { p.ports[0]!.trunkVlanIds = ['missing'] }],
    ['interface device', (p: Project) => { p.interfaces[0]!.deviceId = 'missing' }],
    ['interface VLAN', (p: Project) => { p.interfaces[0]!.vlanId = 'missing' }],
    ['interface port', (p: Project) => { p.interfaces[0]!.portId = 'missing' }],
    ['cable source', (p: Project) => { p.links[0]!.sourcePortId = 'missing'; p.links[0]!.label = '' }],
    ['cable target', (p: Project) => { p.links[0]!.targetPortId = 'missing' }],
    ['allocation hardware', (p: Project) => { p.allocations[0]!.hardwareItemId = 'missing' }],
    ['allocation device', (p: Project) => { p.allocations[0]!.deviceId = 'missing' }],
    ['note attachment', (p: Project) => { p.notes[0]!.attachedTo!.id = 'missing' }],
  ] as const)('rejects a dangling %s reference', (_, mutate) => {
    const project = fixture()
    mutate(project)
    expect(() => parseProjectJson(JSON.stringify(project))).toThrow(/missing|another device/)
  })

  it('rejects cross-device interface ports, cyclic writing, and address plans that break the planner', () => {
    const project = fixture()
    project.interfaces[0]!.portId = 'port2'
    expect(() => parseProjectJson(JSON.stringify(project))).toThrow('another device')
    project.interfaces[0]!.portId = 'port1'
    project.notes[0]!.attachedTo = { entityType: 'checklistItem', id: 'task' }
    expect(() => parseProjectJson(JSON.stringify(project))).toThrow('circular attachment')
    project.notes[0]!.attachedTo = undefined
    project.subnets[0]!.cidr = '192.168.0.0/25'
    expect(() => parseProjectJson(JSON.stringify(project))).toThrow('outside parent')
    project.subnets[0]!.cidr = '10.0.0.0/25'
    project.subnets.push({ ...project.subnets[0]!, id: 'overlap', name: 'Overlap' })
    expect(() => parseProjectJson(JSON.stringify(project))).toThrow('overlaps')
  })

  it('keeps planning shortages importable and reports the available checks without inventing a clean result', () => {
    const project = fixture()
    expect(reportIssues(project)).toEqual([])
    project.allocations[0]!.quantity = 2
    expect(parseProjectJson(JSON.stringify(project)).allocations[0]!.quantity).toBe(2)
    expect(reportIssues(project)).toContainEqual(expect.stringContaining('overallocated'))
    expect(reportAssumptions.join(' ')).toContain('not a routing simulation')
  })

  it('formats errors and safe portable filenames', () => {
    expect(documentError(new Error('Broken'))).toBe('Broken')
    expect(documentError(undefined)).toContain('Could not read')
    try { migrateProject({ schemaVersion: 1 }) } catch (cause) { expect(documentError(cause)).toContain('name:') }
    try { migrateProject(null) } catch (cause) { expect(documentError(cause)).toContain('Project:') }
    expect(projectFilename(' ../HQ / Office plan ', 'json')).toBe('HQ-Office-plan.json')
    expect(projectFilename('...///', 'json')).toBe('netscratch-project.json')
    expect(projectFilename('a'.repeat(200), 'json')).toHaveLength(105)
  })
})
