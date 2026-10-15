import { describe, expect, it } from 'vitest'
import { migrateProject } from './migrations'
import { allocationSchema, createEmptyProject, CURRENT_SCHEMA_VERSION, interfaceSchema, projectSchema, vlanSchema } from './schema'

describe('versioned project schema', () => {
  it('creates independent valid projects with all collections and separate layouts', () => {
    const a = createEmptyProject()
    const b = createEmptyProject('Office')
    expect(projectSchema.parse(a)).toEqual(a)
    expect(a.id).not.toBe(b.id)
    expect(a.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(a.layout).toEqual({ physical: {}, logical: {} })
    a.layout.physical['device'] = { x: 10, y: 20 }
    expect(a.layout.logical).toEqual({})
    expect(b.layout.physical).toEqual({})
  })
  it('round trips a complete document through JSON and migration without mutation', () => {
    const project = createEmptyProject('Office')
    project.addressSpaces.push({ id: 'space', name: 'Office', parentCidr: '192.168.10.0/24', scope: 'HQ' })
    project.vlans.push({ id: 'vlan', name: 'Staff', number: 10 })
    project.subnets.push({ id: 'subnet', addressSpaceId: 'space', name: 'Staff', cidr: '192.168.10.0/25', status: 'allocated', hostRequirement: 100, gatewayIp: '192.168.10.1', vlanId: 'vlan', source: 'auto', notes: '' })
    project.devices.push({ id: 'device', name: 'Router', role: 'router', hardwareItemId: 'hardware', scope: 'HQ', notes: '' })
    project.ports.push({ id: 'port', deviceId: 'device', name: 'Gi0/1', speed: '1 Gbps', media: 'copper', mode: 'trunk', accessVlanId: null, trunkVlanIds: ['vlan'] })
    project.interfaces.push({ id: 'interface', deviceId: 'device', name: 'Gi0/1', kind: 'physical', portId: 'port', vlanId: 'vlan', address: '192.168.10.1/25' })
    project.links.push({ id: 'link', sourcePortId: 'port', targetPortId: 'future-port', cableType: 'Cat6', label: 'Uplink' })
    project.hardwareItems.push({ id: 'hardware', model: 'Example router', category: 'router', quantityAvailable: 1, unitCost: 100, portCount: 4, capabilities: ['routing'] })
    project.allocations.push({ id: 'allocation', hardwareItemId: 'hardware', deviceId: 'device', scope: null, quantity: 1 })
    project.notes.push({ id: 'note', text: 'Installation note', attachedTo: { entityType: 'device', id: 'device' } })
    project.checklistItems.push({ id: 'checklist', task: 'Label cables', status: 'todo' })
    project.layout.physical['device'] = { x: 10, y: -20 }
    const input: unknown = JSON.parse(JSON.stringify(project))
    const result = migrateProject(input)
    expect(result).toEqual(project)
    expect(result).not.toBe(input)
  })
  it.each([null, {}, { schemaVersion: 0 }, { schemaVersion: -1 }, { schemaVersion: '1' }, { schemaVersion: 1.5 }])('rejects malformed or unsupported legacy files %j', (input) => expect(() => migrateProject(input)).toThrow())
  it('rejects future versions without pretending to migrate them', () => expect(() => migrateProject({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toThrow('Update netScratch'))
  it('rejects unknown properties, malformed values, and missing collections', () => {
    const project = createEmptyProject()
    expect(() => migrateProject({ ...project, surprise: true })).toThrow()
    expect(() => migrateProject({ ...project, createdAt: 'yesterday' })).toThrow()
    expect(() => migrateProject({ ...project, ports: undefined })).toThrow()
    expect(() => migrateProject({ ...project, layout: { physical: { node: { x: Infinity, y: 0 } }, logical: {} } })).toThrow()
    expect(() => createEmptyProject('  ')).toThrow()
  })
  it('rejects duplicate IDs across entity collections and the project itself', () => {
    const project = createEmptyProject()
    project.notes.push({ id: project.id, text: 'collision' })
    expect(projectSchema.safeParse(project).success).toBe(false)
    project.notes = [{ id: 'same', text: 'A' }, { id: 'same', text: 'B' }]
    expect(projectSchema.safeParse(project).success).toBe(false)
  })
  it('constrains VLANs, physical interfaces, and allocation targets', () => {
    for (const number of [0, 4095, 1.5]) expect(vlanSchema.safeParse({ id: 'v', name: 'VLAN', number }).success).toBe(false)
    const iface = { id: 'i', deviceId: 'd', name: 'Gi0/1', kind: 'physical', portId: null, vlanId: null, address: '10.0.0.1/24' }
    expect(interfaceSchema.safeParse(iface).success).toBe(false)
    expect(interfaceSchema.safeParse({ ...iface, portId: 'p' }).success).toBe(true)
    expect(interfaceSchema.safeParse({ ...iface, kind: 'loopback', address: '10.0.0.1/32' }).success).toBe(true)
    expect(interfaceSchema.safeParse({ ...iface, portId: 'p', address: 'bad' }).success).toBe(false)
    const allocation = { id: 'a', hardwareItemId: 'h', deviceId: null, scope: null, quantity: 1 }
    expect(allocationSchema.safeParse(allocation).success).toBe(false)
    expect(allocationSchema.safeParse({ ...allocation, scope: 'HQ' }).success).toBe(true)
    expect(allocationSchema.safeParse({ ...allocation, scope: 'HQ', deviceId: 'd' }).success).toBe(false)
  })
})
