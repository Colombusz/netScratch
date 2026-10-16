import { describe, expect, it } from 'vitest'
import { createEmptyProject, projectSchema, type Project, type Subnet } from './schema'
import { addVlan, addBulkVlans, updateVlan, deleteVlan, addInterface, updateInterface, deleteInterface, assignSubnetToVlan, validateLogical, moveLogicalNodes, type InterfaceDetails } from './logical'

function fixture(): Project {
  const project = createEmptyProject()
  project.devices = [
    { id: 'router', name: 'Router', role: 'router', hardwareItemId: null, scope: 'HQ', notes: '' },
    { id: 'switch', name: 'Switch', role: 'switch', hardwareItemId: null, scope: 'HQ', notes: '' },
  ]
  project.ports = ['eth0', 'eth1', 'eth2'].map((id) => ({ id, deviceId: id === 'eth2' ? 'switch' : 'router', name: id, speed: '', media: 'copper', mode: 'routed', accessVlanId: null, trunkVlanIds: [] }))
  project.vlans = [{ id: 'staff', number: 10, name: 'Staff' }, { id: 'guests', number: 20, name: 'Guests' }]
  project.addressSpaces = [{ id: 'space', name: 'Office', parentCidr: '192.168.0.0/16', scope: 'HQ' }]
  project.subnets = [1, 2].map((index): Subnet => ({ id: `subnet${index}`, addressSpaceId: 'space', name: `Subnet ${index}`, cidr: `192.168.${index}.0/24`, status: 'allocated', hostRequirement: 10, gatewayIp: null, vlanId: null, source: 'manual', notes: '' }))
  return project
}

const physical: InterfaceDetails = { kind: 'physical', name: 'WAN', portId: 'eth0', vlanId: null, address: '192.168.1.1/24' }

describe('VLAN transactions', () => {
  it('protects access and trunk references so a saved project remains reloadable', () => {
    const project = fixture()
    project.ports[0]!.accessVlanId = 'staff'
    expect(() => deleteVlan(project, 'staff')).toThrow('ports still reference')
    project.ports[0]!.accessVlanId = null
    project.ports[0]!.trunkVlanIds = ['staff']
    expect(() => deleteVlan(project, 'staff')).toThrow('ports still reference')
    expect(deleteVlan(project, 'guests').vlans.map((vlan) => vlan.id)).toEqual(['staff'])
  })
  it('adds and edits VLANs with unique numbers and stable IDs', () => {
    const project = addVlan(fixture(), { number: 30, name: ' Voice ' })
    const vlan = project.vlans.at(-1)!
    expect(vlan.name).toBe('Voice')
    expect(vlan.id).toBeTruthy()
    const updated = updateVlan(project, vlan.id, { number: 31, name: 'Phones' })
    expect(updated.vlans.at(-1)).toEqual({ id: vlan.id, number: 31, name: 'Phones' })
    expect(updated.vlans.slice(0, 2)).toEqual(project.vlans.slice(0, 2))
    expect(projectSchema.safeParse(updated).success).toBe(true)
  })

  it('rejects invalid numbers, duplicate numbers, missing VLANs, and blank names atomically', () => {
    const project = fixture()
    const snapshot = structuredClone(project)
    for (const number of [0, 4095, 1.5]) expect(() => addVlan(project, { number, name: 'Invalid' })).toThrow()
    expect(() => addVlan(project, { number: 30, name: ' ' })).toThrow()
    expect(() => addVlan(project, { number: 10, name: 'Duplicate' })).toThrow('already exists')
    expect(() => updateVlan(project, 'guests', { number: 10, name: 'Duplicate' })).toThrow('already exists')
    expect(() => updateVlan(project, 'missing', { number: 10, name: 'Missing' })).toThrow('no longer exists')
    expect(() => deleteVlan(project, 'missing')).toThrow('no longer exists')
    expect(project).toEqual(snapshot)
  })

  it('adds bulk ranges and rejects a partially conflicting or out-of-range batch', () => {
    const project = fixture()
    const updated = addBulkVlans(project, { prefix: 'VLAN ', start: 30, count: 3 })
    expect(updated.vlans.slice(2).map((v) => v.number)).toEqual([30, 31, 32])
    expect(new Set(updated.vlans.map((v) => v.id)).size).toBe(5)
    expect(() => addBulkVlans(project, { prefix: 'Test', start: 9, count: 3 })).toThrow('already exists')
    expect(() => addBulkVlans(project, { prefix: 'Test', start: 4094, count: 2 })).toThrow()
    expect(() => addBulkVlans(project, { prefix: 'Test', start: 100, count: 101 })).toThrow()
    expect(project.vlans).toHaveLength(2)
  })

  it('protects attached subnets and interfaces and detaches notes and layout on deletion', () => {
    const project = fixture()
    const withSubnet = assignSubnetToVlan(project, 'subnet1', 'staff')
    expect(() => deleteVlan(withSubnet, 'staff')).toThrow('subnet(s) still reference')
    const withInterface = addInterface(project, 'router', { ...physical, vlanId: 'staff' })
    expect(() => deleteVlan(withInterface, 'staff')).toThrow('interface(s) still reference')
    project.notes = [{ id: 'n1', text: 'Staff', attachedTo: { entityType: 'vlan', id: 'staff' } }, { id: 'n2', text: 'Other' }]
    project.checklistItems = [{ id: 'c1', task: 'Check', status: 'todo', attachedTo: { entityType: 'vlan', id: 'staff' } }, { id: 'c2', task: 'Other', status: 'done', attachedTo: { entityType: 'vlan', id: 'guests' } }]
    project.layout.logical = { 'vlan:staff': { x: 0, y: 0 }, 'vlan:guests': { x: 50, y: 0 } }
    const deleted = deleteVlan(project, 'staff')
    expect(deleted.vlans.map((v) => v.id)).toEqual(['guests'])
    expect(deleted.notes[0]!.attachedTo).toBeUndefined()
    expect(deleted.notes[1]).toEqual(project.notes[1])
    expect(deleted.checklistItems[0]!.attachedTo).toBeUndefined()
    expect(deleted.checklistItems[1]).toEqual(project.checklistItems[1])
    expect(deleted.layout.logical).toEqual({ 'vlan:guests': { x: 50, y: 0 } })
  })
})

describe('interface transactions', () => {
  it('accepts host addresses and updates physical, SVI, subinterface, and loopback records', () => {
    let project = addInterface(fixture(), 'router', physical)
    const id = project.interfaces[0]!.id
    project = addInterface(project, 'router', { ...physical, portId: 'eth1', name: 'LAN' })
    project = updateInterface(project, id, { ...physical, address: '192.168.1.2/24', vlanId: 'staff' })
    expect(project.interfaces[0]!.address).toBe('192.168.1.2/24')
    for (const kind of ['SVI', 'subinterface', 'loopback'] as const) {
      project = addInterface(project, 'router', { kind, name: kind, portId: null, vlanId: kind === 'loopback' ? null : 'guests', address: kind === 'loopback' ? '10.0.0.1/32' : null })
    }
    expect(projectSchema.safeParse(project).success).toBe(true)
    expect(validateLogical(project)).toEqual([])
    expect(project.interfaces[0]!.id).toBe(id)
    expect(project.interfaces[1]!.name).toBe('LAN')
  })

  it('rejects missing references, ports on a different device, reused ports, and invalid addresses', () => {
    const project = addInterface(fixture(), 'router', physical)
    const snapshot = structuredClone(project)
    const id = project.interfaces[0]!.id
    expect(() => addInterface(project, 'missing', physical)).toThrow('Device not found')
    expect(() => updateInterface(project, 'missing', physical)).toThrow('no longer exists')
    expect(() => deleteInterface(project, 'missing')).toThrow('no longer exists')
    for (const input of [
      { ...physical, portId: null },
      { ...physical, portId: 'missing' },
      { ...physical, portId: 'eth2' },
      { ...physical, portId: 'eth1', vlanId: 'missing' },
      { ...physical, address: '192.168.1.999/24' },
    ]) {
      expect(() => addInterface(project, 'router', input)).toThrow()
      expect(() => updateInterface(project, id, input)).toThrow()
    }
    expect(() => addInterface(project, 'router', physical)).toThrow('already has a physical interface')
    const p2 = addInterface(project, 'router', { ...physical, portId: 'eth1' })
    expect(() => updateInterface(p2, id, { ...physical, portId: 'eth1' })).toThrow('already has a physical interface')
    expect(project).toEqual(snapshot)
  })

  it('deletes an interface and detaches only its own notes and checklist items', () => {
    let project = addInterface(fixture(), 'router', physical)
    const id = project.interfaces[0]!.id
    project = addInterface(project, 'router', { ...physical, portId: 'eth1' })
    project.notes = [{ id: 'n1', text: 'Interface', attachedTo: { entityType: 'interface', id } }, { id: 'n2', text: 'Unattached' }]
    project.checklistItems = [{ id: 'c1', task: 'Check interface', status: 'doing', attachedTo: { entityType: 'interface', id } }, { id: 'c2', task: 'Other', status: 'todo', attachedTo: { entityType: 'interface', id: project.interfaces[1]!.id } }]
    project.layout.logical = { [`iface:${id}`]: { x: 10, y: 20 }, 'vlan:staff': { x: 0, y: 0 } }
    const deleted = deleteInterface(project, id)
    expect(deleted.interfaces).toHaveLength(1)
    expect(deleted.notes[0]!.attachedTo).toBeUndefined()
    expect(deleted.notes[1]).toEqual(project.notes[1])
    expect(deleted.checklistItems[0]!.attachedTo).toBeUndefined()
    expect(deleted.checklistItems[1]).toEqual(project.checklistItems[1])
    expect(deleted.layout.logical).toEqual({ 'vlan:staff': { x: 0, y: 0 } })
  })
})

describe('logical subnet assignments and validation', () => {
  it('persists logical positions independently and rejects stale or invalid moves atomically', () => {
    const project = addInterface(fixture(), 'router', physical)
    const id = project.interfaces[0]!.id
    const moved = moveLogicalNodes(project, { 'vlan:staff': { x: 50, y: 60 }, 'subnet:subnet1': { x: 350, y: 60 }, [`iface:${id}`]: { x: 650, y: 60 } })
    expect(moved.layout.logical['vlan:staff']).toEqual({ x: 50, y: 60 })
    expect(moved.layout.physical).toEqual(project.layout.physical)
    expect(project.layout.logical).toEqual({})
    expect(moveLogicalNodes(project, {})).toBe(project)
    expect(() => moveLogicalNodes(project, { 'vlan:missing': { x: 0, y: 0 } })).toThrow('no longer exists')
    expect(() => moveLogicalNodes(project, { 'vlan:staff': { x: Infinity, y: 0 } })).toThrow()
  })
  it('assigns and clears a VLAN while preserving other subnets and rejecting conflicts', () => {
    const project = assignSubnetToVlan(fixture(), 'subnet1', 'staff')
    expect(project.subnets[0]!.vlanId).toBe('staff')
    expect(project.subnets[1]!.vlanId).toBeNull()
    expect(() => assignSubnetToVlan(project, 'missing', 'staff')).toThrow('no longer exists')
    expect(() => assignSubnetToVlan(project, 'subnet1', 'missing')).toThrow('VLAN not found')
    expect(() => assignSubnetToVlan(project, 'subnet2', 'staff')).toThrow('already assigned')
    expect(assignSubnetToVlan(project, 'subnet1', null).subnets[0]!.vlanId).toBeNull()
  })

  it('reports duplicate assignments, missing references, and invalid addresses on existing data', () => {
    const project = fixture()
    project.subnets.forEach((subnet) => { subnet.vlanId = 'staff' })
    project.interfaces = [{ ...physical, id: 'iface', deviceId: 'router', portId: 'missing', vlanId: 'missing', address: 'bad address' }]
    expect(validateLogical(project)).toEqual(expect.arrayContaining([
      expect.stringContaining('multiple subnets'), expect.stringContaining('missing VLAN'), expect.stringContaining('missing port'), expect.stringContaining('invalid address'),
    ]))
    expect(validateLogical(project)).toHaveLength(4)
  })
})
