import { describe, expect, it } from 'vitest'
import { addBulkPorts, addDevice, addPorts, connectionError, deleteCable, deleteDevice, deletePort, moveDevices, saveCable, updateDevice, updatePort } from './topology'
import { createEmptyProject, projectSchema } from './schema'

function office() {
  let project = addDevice(createEmptyProject(), { name: 'Router', role: 'router', scope: 'HQ' }, { x: 10, y: 20 })
  project = addDevice(project, { name: 'Switch', role: 'switch', scope: 'HQ' }, { x: 400, y: 20 })
  const [router, sw] = project.devices
  project = addPorts(project, router!.id, [{ name: 'Gi0/0', speed: '1 Gbps', media: 'copper' }])
  project = addBulkPorts(project, sw!.id, { prefix: 'Gi0/', start: 1, count: 24, speed: '1 Gbps', media: 'copper' })
  const [source, target] = project.ports
  project = saveCable(project, { sourcePortId: source!.id, targetPortId: target!.id, cableType: 'Cat6', label: 'Uplink' })
  return project
}

describe('physical topology transactions', () => {
  it('creates devices and ports with stable IDs, independent of editable labels', () => {
    const project = office()
    expect(projectSchema.parse(project)).toEqual(project)
    expect(new Set(project.ports.map((port) => port.id)).size).toBe(25)
    expect(project.ports.at(-1)?.name).toBe('Gi0/24')
    const device = project.devices[0]!
    const port = project.ports[0]!
    const renamed = updatePort(updateDevice(project, device.id, { name: 'Edge', role: 'firewall', scope: 'Branch' }), port.id, { name: 'WAN', speed: '10 Gbps', media: 'fiber' })
    expect(renamed.devices[0]).toMatchObject({ id: device.id, name: 'Edge', scope: 'Branch' })
    expect(renamed.ports[0]).toMatchObject({ id: port.id, name: 'WAN', speed: '10 Gbps', media: 'fiber' })
    expect(renamed.links).toBe(project.links)
    expect(renamed.links[0]?.sourcePortId).toBe(port.id)
    expect(project.devices[0]?.name).toBe('Router')
  })
  it('preserves unrelated references during movement, edits, and port additions', () => {
    const project = office()
    const id = project.devices[0]!.id
    const moved = moveDevices(project, [{ id, position: { x: -25, y: 900.5 } }])
    expect(moved.layout.physical[id]).toEqual({ x: -25, y: 900.5 })
    expect(moved.devices).toBe(project.devices)
    expect(moved.ports).toBe(project.ports)
    expect(moved.links).toBe(project.links)
    expect(moved.layout.logical).toBe(project.layout.logical)
    expect(moveDevices(project, [])).toBe(project)
    const edited = updateDevice(project, id, { name: 'Edge', role: 'router', scope: 'HQ' })
    expect(edited.devices[1]).toBe(project.devices[1])
    const added = addPorts(project, id, [{ name: 'Loopback0', speed: 'N/A', media: 'copper' }])
    expect(added.ports[0]).toBe(project.ports[0])
  })
  it('rejects invalid coordinates and stale device updates without partial commits', () => {
    const project = office()
    const before = structuredClone(project)
    expect(() => moveDevices(project, [{ id: project.devices[0]!.id, position: { x: 50, y: 50 } }, { id: 'missing', position: { x: 0, y: 0 } }])).toThrow('no longer exists')
    expect(() => moveDevices(project, [{ id: project.devices[0]!.id, position: { x: NaN, y: 0 } }])).toThrow()
    expect(() => addDevice(project, { name: '', role: 'router', scope: 'HQ' }, { x: 0, y: 0 })).toThrow()
    expect(() => addDevice(project, { name: 'New', role: 'router', scope: 'HQ' }, { x: Infinity, y: 0 })).toThrow()
    expect(() => updateDevice(project, 'missing', { name: 'New', role: 'router', scope: 'HQ' })).toThrow()
    expect(project).toEqual(before)
  })
  it('rejects duplicate port names atomically, but allows the same names on different devices', () => {
    const project = office()
    const sw = project.devices[1]!.id
    const details = { name: 'Gi0/1', speed: '1 Gbps', media: 'copper' as const }
    expect(() => addPorts(project, sw, [details])).toThrow('already exists')
    expect(() => addPorts(project, sw, [{ ...details, name: 'Gi0/25' }, { ...details, name: 'Gi0/25' }])).toThrow('already exists')
    expect(() => addBulkPorts(project, sw, { prefix: 'Gi0/', start: 20, count: 10, speed: '1 Gbps', media: 'copper' })).toThrow('already exists')
    expect(project.ports).toHaveLength(25)
    expect(addPorts(project, project.devices[0]!.id, [details]).ports).toHaveLength(26)
    expect(() => updatePort(project, project.ports[2]!.id, details)).toThrow('already exists')
    expect(() => updatePort(project, 'missing', details)).toThrow('no longer exists')
    expect(() => addPorts(project, sw, [])).toThrow()
  })
  it.each([
    { start: -1 }, { start: 1.5 }, { count: 0 }, { count: 257 }, { prefix: '' }, { speed: '' }, { start: 65535, count: 2 },
  ])('rejects malformed bulk-port input %j', (patch) => {
    const project = office()
    expect(() => addBulkPorts(project, project.devices[0]!.id, { prefix: 'Eth', start: 1, count: 24, speed: '1 Gbps', media: 'copper', ...patch })).toThrow()
  })
  it('accepts the bulk-port boundary and a zero-based pattern', () => {
    let project = addDevice(createEmptyProject(), { name: 'Chassis', role: 'switch', scope: 'HQ' }, { x: 0, y: 0 })
    project = addBulkPorts(project, project.devices[0]!.id, { prefix: 'Eth', start: 0, count: 256, speed: '10 Gbps', media: 'fiber' })
    expect(project.ports).toHaveLength(256)
    expect(project.ports[0]?.name).toBe('Eth0')
    expect(project.ports.at(-1)?.name).toBe('Eth255')
  })
  it('rejects missing endpoints, self-links, and occupation in either direction', () => {
    const project = office()
    const [a, b, c] = project.ports
    expect(connectionError(project, 'missing', b!.id)).toContain('existing ports')
    expect(connectionError(project, a!.id, a!.id)).toContain('itself')
    expect(connectionError(project, a!.id, c!.id)).toContain('only one cable')
    expect(connectionError(project, c!.id, b!.id)).toContain('only one cable')
    expect(() => saveCable(project, { sourcePortId: a!.id, targetPortId: c!.id, cableType: 'Cat6', label: '' })).toThrow('only one cable')
    expect(project.links).toHaveLength(1)
  })
  it('rewires and relabels an existing cable without changing its ID', () => {
    const project = office()
    const link = project.links[0]!
    const next = saveCable(project, { sourcePortId: link.sourcePortId, targetPortId: project.ports[2]!.id, cableType: 'Fiber', label: 'Rack A' }, link.id)
    expect(next.links[0]).toEqual({ ...link, targetPortId: project.ports[2]!.id, cableType: 'Fiber', label: 'Rack A' })
    expect(next.ports).toBe(project.ports)
    expect(connectionError(next, project.ports[1]!.id, project.ports[3]!.id)).toBe(null)
    expect(() => saveCable(project, { ...link }, 'missing')).toThrow('no longer exists')
    const two = saveCable(project, { sourcePortId: project.ports[2]!.id, targetPortId: project.ports[3]!.id, cableType: 'DAC', label: '' })
    expect(saveCable(two, { sourcePortId: link.sourcePortId, targetPortId: link.targetPortId, cableType: 'Cat6A', label: '' }, link.id).links[1]).toBe(two.links[1])
  })
  it('deletes a device with its ports, cables and dependent records while retaining attached text', () => {
    const project = office()
    const device = project.devices[0]!
    const port = project.ports[0]!
    const link = project.links[0]!
    project.interfaces.push({ id: 'iface', deviceId: device.id, kind: 'physical', name: 'WAN', portId: port.id, vlanId: null, address: null })
    project.allocations.push({ id: 'allocation', hardwareItemId: 'hardware', deviceId: device.id, scope: null, quantity: 1 })
    project.notes.push({ id: 'note', text: 'Keep this text', attachedTo: { entityType: 'device', id: device.id } }, { id: 'standalone', text: 'Keep' })
    project.checklistItems.push({ id: 'todo', task: 'Check cable', status: 'todo', attachedTo: { entityType: 'link', id: link.id } })
    project.layout.logical[device.id] = { x: 1, y: 2 }
    const next = deleteDevice(project, device.id)
    expect(next.devices).toHaveLength(1)
    expect(next.ports).toHaveLength(24)
    expect(next.links).toEqual([])
    expect(next.interfaces).toEqual([])
    expect(next.allocations).toEqual([])
    expect(next.notes[0]).toEqual({ id: 'note', text: 'Keep this text' })
    expect(next.notes[1]).toBe(project.notes[1])
    expect(next.checklistItems[0]?.attachedTo).toBeUndefined()
    expect(next.layout.physical[device.id]).toBeUndefined()
    expect(next.layout.logical[device.id]).toBeUndefined()
    expect(project.devices).toHaveLength(2)
    expect(project.ports).toHaveLength(25)
    expect(projectSchema.parse(next)).toEqual(next)
  })
  it('deletes only a cable or only a port and its attached cable as requested', () => {
    const project = office()
    const noCable = deleteCable(project, project.links[0]!.id)
    expect(noCable.ports).toHaveLength(25)
    expect(noCable.links).toEqual([])
    const noPort = deletePort(project, project.ports[0]!.id)
    expect(noPort.devices).toHaveLength(2)
    expect(noPort.ports).toHaveLength(24)
    expect(noPort.links).toEqual([])
    const spare = deletePort(project, project.ports[2]!.id)
    expect(spare.links).toHaveLength(1)
    expect(() => deleteCable(project, 'missing')).toThrow()
    expect(() => deletePort(project, 'missing')).toThrow()
    expect(() => deleteDevice(project, 'missing')).toThrow()
  })
  it('retains unrelated logical data through a physical edit', () => {
    const project = office()
    project.subnets.push({ id: 'subnet', addressSpaceId: 'space', name: 'Staff', cidr: '10.0.0.0/24', status: 'allocated', hostRequirement: 100, gatewayIp: '10.0.0.1', vlanId: null, source: 'auto', notes: '' })
    const next = deleteDevice(project, project.devices[0]!.id)
    expect(next.subnets).toBe(project.subnets)
    expect(next.addressSpaces).toBe(project.addressSpaces)
  })
})

