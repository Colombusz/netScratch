import { z } from 'zod'
import { parseCidr, parseNetwork, ipToNumber } from './cidr'

export const CURRENT_SCHEMA_VERSION = 1
const id = z.string().min(1)
const name = z.string().trim().min(1)
const optionalId = id.nullable()
const nonnegativeInt = z.number().int().nonnegative()
const valid = (check: () => unknown) => { try { check(); return true } catch { return false } }
export const ipv4Schema = z.string().refine((value) => valid(() => ipToNumber(value)), 'Invalid IPv4 address.')
export const cidrSchema = z.string().regex(/^\d+\.\d+\.\d+\.\d+\/\d+$/, 'Use CIDR notation, such as 192.168.10.0/24.')
  .refine((value) => valid(() => parseNetwork(value)), 'CIDR must be a valid, aligned IPv4 network.')
export const interfaceAddressSchema = z.string().regex(/^\d+\.\d+\.\d+\.\d+\/\d+$/)
  .refine((value) => valid(() => parseCidr(value)), 'Invalid interface IPv4 address and prefix.')

export const addressSpaceSchema = z.strictObject({ id, name, parentCidr: cidrSchema, scope: name })
export const vlanSchema = z.strictObject({ id, number: z.number().int().min(1).max(4094), name })
export const subnetSchema = z.strictObject({
  id, addressSpaceId: id, name, cidr: cidrSchema,
  status: z.enum(['allocated', 'reserved']),
  hostRequirement: nonnegativeInt.max(4_294_967_294),
  gatewayIp: ipv4Schema.nullable(), vlanId: optionalId,
  source: z.enum(['auto', 'manual']), notes: z.string(),
}).refine((s) => s.status === 'reserved' || s.hostRequirement > 0, {
  message: 'An allocated subnet needs at least one usable address.', path: ['hostRequirement'],
})
export const deviceSchema = z.strictObject({
  id, name, role: z.enum(['router', 'switch', 'firewall', 'access point', 'endpoint', 'server', 'other']),
  hardwareItemId: optionalId, scope: name, notes: z.string(),
})
export const portSchema = z.strictObject({
  id, deviceId: id, name, speed: z.string(), media: z.enum(['copper', 'fiber']),
  mode: z.enum(['access', 'trunk', 'routed', 'unused']),
  accessVlanId: optionalId, trunkVlanIds: z.array(id),
})
export const interfaceSchema = z.strictObject({
  id, deviceId: id, kind: z.enum(['physical', 'subinterface', 'SVI', 'loopback']),
  name, portId: optionalId, vlanId: optionalId, address: interfaceAddressSchema.nullable(),
}).refine((i) => i.kind !== 'physical' || i.portId !== null, {
  message: 'A physical interface needs a port.', path: ['portId'],
})
export const linkSchema = z.strictObject({ id, sourcePortId: id, targetPortId: id, cableType: z.string(), label: z.string() })
export const hardwareItemSchema = z.strictObject({
  id, model: name, category: name, quantityAvailable: nonnegativeInt,
  unitCost: z.number().nonnegative(), portCount: nonnegativeInt, capabilities: z.array(z.string()),
})
export const allocationDetailsSchema = z.strictObject({
  hardwareItemId: id, deviceId: optionalId, scope: name.nullable(), quantity: z.number().int().positive(),
}).refine((a) => (a.deviceId === null) !== (a.scope === null), 'Assign hardware to either a device or a scope.')
export const allocationSchema = allocationDetailsSchema.safeExtend({ id })
export const attachmentSchema = z.strictObject({
  entityType: z.enum(['project', 'addressSpace', 'vlan', 'subnet', 'device', 'port', 'interface', 'link', 'hardwareItem', 'allocation', 'note', 'checklistItem']),
  id,
})
export const noteSchema = z.strictObject({ id, text: z.string(), attachedTo: attachmentSchema.optional() })
export const checklistItemSchema = z.strictObject({ id, task: name, status: z.enum(['todo', 'doing', 'done']), attachedTo: attachmentSchema.optional() })
const positionsSchema = z.record(id, z.strictObject({ x: z.number(), y: z.number() }))
export const projectSchema = z.strictObject({
  id, name, schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  addressSpaces: z.array(addressSpaceSchema), vlans: z.array(vlanSchema), subnets: z.array(subnetSchema),
  devices: z.array(deviceSchema), ports: z.array(portSchema), interfaces: z.array(interfaceSchema),
  links: z.array(linkSchema), hardwareItems: z.array(hardwareItemSchema), allocations: z.array(allocationSchema),
  notes: z.array(noteSchema), checklistItems: z.array(checklistItemSchema),
  layout: z.strictObject({ physical: positionsSchema, logical: positionsSchema }),
}).superRefine((project, ctx) => {
  const seen = new Set([project.id])
  const collections = ['addressSpaces', 'vlans', 'subnets', 'devices', 'ports', 'interfaces', 'links', 'hardwareItems', 'allocations', 'notes', 'checklistItems'] as const
  for (const key of collections) {
    project[key].forEach((entity, index) => {
      if (seen.has(entity.id)) ctx.addIssue({ code: 'custom', message: 'Every entity must have a unique ID.', path: [key, index, 'id'] })
      seen.add(entity.id)
    })
  }
})

export type Project = z.infer<typeof projectSchema>
export type AddressSpace = z.infer<typeof addressSpaceSchema>
export type Vlan = z.infer<typeof vlanSchema>
export type Subnet = z.infer<typeof subnetSchema>
export type Device = z.infer<typeof deviceSchema>
export type Port = z.infer<typeof portSchema>
export type Interface = z.infer<typeof interfaceSchema>
export type Link = z.infer<typeof linkSchema>
export type HardwareItem = z.infer<typeof hardwareItemSchema>
export type Allocation = z.infer<typeof allocationSchema>
export type Note = z.infer<typeof noteSchema>
export type ChecklistItem = z.infer<typeof checklistItemSchema>

export function createEmptyProject(projectName = 'Untitled network'): Project {
  const now = new Date().toISOString()
  return projectSchema.parse({
    id: crypto.randomUUID(), name: projectName, schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: now, updatedAt: now,
    addressSpaces: [], vlans: [], subnets: [], devices: [], ports: [], interfaces: [], links: [],
    hardwareItems: [], allocations: [], notes: [], checklistItems: [],
    layout: { physical: {}, logical: {} },
  })
}
