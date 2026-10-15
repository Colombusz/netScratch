import { z } from 'zod'
import { deviceSchema, linkSchema, portSchema, type Device, type Port, type Project } from './schema'

export const deviceDetailsSchema = deviceSchema.pick({ name: true, role: true, scope: true })
export const portDetailsSchema = portSchema.pick({ name: true, speed: true, media: true }).extend({
  name: z.string().trim().min(1, 'Give the port a name.'),
  speed: z.string().trim().min(1, 'Enter the port speed.'),
})
export const bulkPortsSchema = z.strictObject({
  prefix: z.string().trim().min(1, 'Enter a prefix, such as Gi0/.'),
  start: z.number().int().min(0).max(65535),
  count: z.number().int().min(1).max(256, 'Add up to 256 ports per batch.'),
  speed: portDetailsSchema.shape.speed,
  media: portDetailsSchema.shape.media,
}).refine((value) => value.start + value.count - 1 <= 65535, 'The last port number must be at most 65535.')
export const cableDetailsSchema = linkSchema.pick({ sourcePortId: true, targetPortId: true, cableType: true, label: true }).extend({
  cableType: z.string().trim().min(1, 'Enter a cable type.'),
  label: z.string().trim(),
})
export const positionSchema = z.strictObject({ x: z.number(), y: z.number() })
export type DeviceDetails = z.infer<typeof deviceDetailsSchema>
export type PortDetails = z.infer<typeof portDetailsSchema>
export type BulkPorts = z.infer<typeof bulkPortsSchema>
export type CableDetails = z.infer<typeof cableDetailsSchema>
export type Position = z.infer<typeof positionSchema>

function changed(project: Project, patch: Partial<Project>): Project {
  return { ...project, ...patch, updatedAt: new Date().toISOString() }
}

function requireDevice(project: Project, id: string): Device {
  const device = project.devices.find((d) => d.id === id)
  if (!device) throw new Error('This device no longer exists.')
  return device
}

function requirePort(project: Project, id: string): Port {
  const port = project.ports.find((p) => p.id === id)
  if (!port) throw new Error('This port no longer exists.')
  return port
}

export function addDevice(project: Project, input: DeviceDetails, position: Position): Project {
  const details = deviceDetailsSchema.parse(input)
  const point = positionSchema.parse(position)
  const device: Device = { id: crypto.randomUUID(), ...details, hardwareItemId: null, notes: '' }
  return changed(project, {
    devices: [...project.devices, device],
    layout: { ...project.layout, physical: { ...project.layout.physical, [device.id]: point } },
  })
}

export function updateDevice(project: Project, id: string, input: DeviceDetails): Project {
  requireDevice(project, id)
  const details = deviceDetailsSchema.parse(input)
  return changed(project, { devices: project.devices.map((d) => d.id === id ? { ...d, ...details } : d) })
}

export function moveDevices(project: Project, changes: { id: string; position: Position }[]): Project {
  const physical = { ...project.layout.physical }
  for (const change of changes) {
    requireDevice(project, change.id)
    physical[change.id] = positionSchema.parse(change.position)
  }
  return changes.length ? changed(project, { layout: { ...project.layout, physical } }) : project
}

export function addPorts(project: Project, deviceId: string, inputs: PortDetails[]): Project {
  requireDevice(project, deviceId)
  const details = z.array(portDetailsSchema).min(1).parse(inputs)
  const names = new Set(project.ports.filter((p) => p.deviceId === deviceId).map((p) => p.name))
  for (const port of details) {
    if (names.has(port.name)) throw new Error(`Port ${port.name} already exists on this device. Choose a different name or starting number.`)
    names.add(port.name)
  }
  const ports = details.map((port): Port => ({ id: crypto.randomUUID(), deviceId, ...port, mode: 'unused', accessVlanId: null, trunkVlanIds: [] }))
  return changed(project, { ports: [...project.ports, ...ports] })
}

export function addBulkPorts(project: Project, deviceId: string, input: BulkPorts): Project {
  const { prefix, start, count, speed, media } = bulkPortsSchema.parse(input)
  return addPorts(project, deviceId, Array.from({ length: count }, (_, index) => ({ name: `${prefix}${start + index}`, speed, media })))
}

export function updatePort(project: Project, id: string, input: PortDetails): Project {
  const port = requirePort(project, id)
  const details = portDetailsSchema.parse(input)
  if (project.ports.some((p) => p.deviceId === port.deviceId && p.id !== id && p.name === details.name)) throw new Error(`Port ${details.name} already exists on this device.`)
  return changed(project, { ports: project.ports.map((p) => p.id === id ? { ...p, ...details } : p) })
}

export function connectionError(project: Pick<Project, 'ports' | 'links'>, sourcePortId: string, targetPortId: string, exceptLinkId?: string): string | null {
  if (!project.ports.some((p) => p.id === sourcePortId) || !project.ports.some((p) => p.id === targetPortId)) return 'Both cable ends must reference existing ports.'
  if (sourcePortId === targetPortId) return 'A port cannot connect to itself.'
  const occupied = project.links.some((link) => link.id !== exceptLinkId && [link.sourcePortId, link.targetPortId].some((id) => id === sourcePortId || id === targetPortId))
  return occupied ? 'A physical port can have only one cable. Remove or edit its existing cable first.' : null
}

export function saveCable(project: Project, input: CableDetails, id?: string): Project {
  if (id && !project.links.some((link) => link.id === id)) throw new Error('This cable no longer exists.')
  const details = cableDetailsSchema.parse(input)
  const error = connectionError(project, details.sourcePortId, details.targetPortId, id)
  if (error) throw new Error(error)
  const cable = { id: id ?? crypto.randomUUID(), ...details }
  return changed(project, { links: id ? project.links.map((link) => link.id === id ? cable : link) : [...project.links, cable] })
}

function removeEntities(project: Project, devices: Set<string>, ports: Set<string>, links: Set<string>): Project {
  const interfaces = new Set(project.interfaces.filter((i) => devices.has(i.deviceId) || (i.portId !== null && ports.has(i.portId))).map((i) => i.id))
  const allocations = new Set(project.allocations.filter((a) => a.deviceId !== null && devices.has(a.deviceId)).map((a) => a.id))
  const removed = new Set([...devices, ...ports, ...links, ...interfaces, ...allocations])
  const detach = <T extends { attachedTo?: { id: string } }>(item: T): T => {
    if (!item.attachedTo || !removed.has(item.attachedTo.id)) return item
    const { attachedTo: _attachment, ...rest } = item
    return rest as T
  }
  const cleanPositions = (positions: Record<string, Position>) => Object.fromEntries(Object.entries(positions).filter(([id]) => !removed.has(id)))
  return changed(project, {
    devices: project.devices.filter((d) => !devices.has(d.id)), ports: project.ports.filter((p) => !ports.has(p.id)),
    links: project.links.filter((link) => !links.has(link.id)), interfaces: project.interfaces.filter((i) => !interfaces.has(i.id)),
    allocations: project.allocations.filter((a) => !allocations.has(a.id)), notes: project.notes.map(detach), checklistItems: project.checklistItems.map(detach),
    layout: { physical: cleanPositions(project.layout.physical), logical: cleanPositions(project.layout.logical) },
  })
}

export function deleteDevice(project: Project, id: string): Project {
  requireDevice(project, id)
  const ports = new Set(project.ports.filter((p) => p.deviceId === id).map((p) => p.id))
  const links = new Set(project.links.filter((link) => ports.has(link.sourcePortId) || ports.has(link.targetPortId)).map((link) => link.id))
  return removeEntities(project, new Set([id]), ports, links)
}

export function deletePort(project: Project, id: string): Project {
  requirePort(project, id)
  const links = new Set(project.links.filter((link) => link.sourcePortId === id || link.targetPortId === id).map((link) => link.id))
  return removeEntities(project, new Set(), new Set([id]), links)
}

export function deleteCable(project: Project, id: string): Project {
  if (!project.links.some((link) => link.id === id)) throw new Error('This cable no longer exists.')
  return removeEntities(project, new Set(), new Set(), new Set([id]))
}
