import { z } from 'zod'
import { parseCidr } from './cidr'
import { interfaceAddressSchema, projectSchema, type Vlan, type Interface, type Subnet, type Project } from './schema'

const name = z.string().trim().min(1)

export const vlanDetailsSchema = z.strictObject({ number: z.number().int().min(1).max(4094), name })
export const interfaceDetailsSchema = z.strictObject({ 
  kind: z.enum(['physical', 'subinterface', 'SVI', 'loopback']), 
  name, 
  portId: z.string().min(1).nullable(), 
  vlanId: z.string().min(1).nullable(), 
  address: interfaceAddressSchema.nullable() 
})
export const bulkVlanSchema = z.strictObject({
  prefix: z.string().trim().min(1, 'Enter a VLAN name prefix.'),
  start: z.number().int().min(1).max(4094),
  count: z.number().int().min(1).max(100, 'Add up to 100 VLANs per batch.'),
}).refine((value) => value.start + value.count - 1 <= 4094, 'The last VLAN number must be at most 4094.')

export type VlanDetails = z.infer<typeof vlanDetailsSchema>
export type InterfaceDetails = z.infer<typeof interfaceDetailsSchema>
export type BulkVlan = z.infer<typeof bulkVlanSchema>

function changed(project: Project, patch: Partial<Project>): Project {
  return { ...project, ...patch, updatedAt: new Date().toISOString() }
}

function requireVlan(project: Project, id: string): Vlan {
  const vlan = project.vlans.find((v) => v.id === id)
  if (!vlan) throw new Error('This VLAN no longer exists.')
  return vlan
}

function requireInterface(project: Project, id: string): Interface {
  const iface = project.interfaces.find((i) => i.id === id)
  if (!iface) throw new Error('This interface no longer exists.')
  return iface
}

function requireSubnet(project: Project, id: string): Subnet {
  const subnet = project.subnets.find((s) => s.id === id)
  if (!subnet) throw new Error('This subnet no longer exists.')
  return subnet
}

export function addVlan(project: Project, input: VlanDetails): Project {
  const details = vlanDetailsSchema.parse(input)
  if (project.vlans.some((v) => v.number === details.number)) throw new Error(`VLAN ${details.number} already exists.`)
  const vlan: Vlan = { id: crypto.randomUUID(), ...details }
  return changed(project, { vlans: [...project.vlans, vlan] })
}

export function addBulkVlans(project: Project, input: BulkVlan): Project {
  const { prefix, start, count } = bulkVlanSchema.parse(input)
  const existingNumbers = new Set(project.vlans.map((v) => v.number))
  const vlans: Vlan[] = []
  for (let i = 0; i < count; i++) {
    const number = start + i
    if (existingNumbers.has(number)) throw new Error(`VLAN ${number} already exists.`)
    vlans.push({ id: crypto.randomUUID(), number, name: `${prefix}${number}` })
    existingNumbers.add(number)
  }
  return changed(project, { vlans: [...project.vlans, ...vlans] })
}

export function updateVlan(project: Project, id: string, input: VlanDetails): Project {
  requireVlan(project, id)
  const details = vlanDetailsSchema.parse(input)
  if (project.vlans.some((v) => v.id !== id && v.number === details.number)) throw new Error(`VLAN ${details.number} already exists.`)
  return changed(project, { vlans: project.vlans.map((v) => v.id === id ? { ...v, ...details } : v) })
}

export function deleteVlan(project: Project, id: string): Project {
  requireVlan(project, id)
  const attachedInterfaces = project.interfaces.filter((i) => i.vlanId === id)
  if (attachedInterfaces.length > 0) throw new Error(`Cannot delete VLAN: ${attachedInterfaces.length} interface(s) still reference it.`)
  const attachedSubnets = project.subnets.filter((s) => s.vlanId === id)
  if (attachedSubnets.length > 0) throw new Error(`Cannot delete VLAN: ${attachedSubnets.length} subnet(s) still reference it.`)
  if (project.ports.some((port) => port.accessVlanId === id || port.trunkVlanIds.includes(id))) throw new Error('Cannot delete VLAN: ports still reference it as an access or trunk VLAN.')
  return changed(project, {
    vlans: project.vlans.filter((v) => v.id !== id),
    subnets: project.subnets.map((s) => s.vlanId === id ? { ...s, vlanId: null } : s),
    interfaces: project.interfaces.map((i) => i.vlanId === id ? { ...i, vlanId: null } : i),
    notes: project.notes.map((n) => n.attachedTo?.entityType === 'vlan' && n.attachedTo.id === id ? { ...n, attachedTo: undefined } : n),
    checklistItems: project.checklistItems.map((c) => c.attachedTo?.entityType === 'vlan' && c.attachedTo.id === id ? { ...c, attachedTo: undefined } : c),
    layout: { ...project.layout, logical: Object.fromEntries(Object.entries(project.layout.logical).filter(([key]) => key !== `vlan:${id}`)) },
  })
}

export function addInterface(project: Project, deviceId: string, input: InterfaceDetails): Project {
  const device = project.devices.find((d) => d.id === deviceId)
  if (!device) throw new Error('Device not found.')
  const details = interfaceDetailsSchema.parse(input)
  if (details.kind === 'physical' && !details.portId) throw new Error('A physical interface requires a port.')
  if (details.kind === 'physical' && details.portId) {
    const port = project.ports.find((p) => p.id === details.portId && p.deviceId === deviceId)
    if (!port) throw new Error('Port not found on this device.')
    if (project.interfaces.some((i) => i.portId === details.portId)) throw new Error('This port already has a physical interface.')
  }
  if (details.vlanId && !project.vlans.some((v) => v.id === details.vlanId)) throw new Error('VLAN not found.')
  if (details.address) {
    parseCidr(details.address)
  }
  const iface: Interface = { id: crypto.randomUUID(), deviceId, ...details }
  return changed(project, { interfaces: [...project.interfaces, iface] })
}

export function updateInterface(project: Project, id: string, input: InterfaceDetails): Project {
  requireInterface(project, id)
  const details = interfaceDetailsSchema.parse(input)
  const iface = project.interfaces.find((i) => i.id === id)!
  if (details.kind === 'physical' && !details.portId) throw new Error('A physical interface requires a port.')
  if (details.kind === 'physical' && details.portId) {
    const port = project.ports.find((p) => p.id === details.portId && p.deviceId === iface.deviceId)
    if (!port) throw new Error('Port not found on this device.')
    if (project.interfaces.some((i) => i.id !== id && i.portId === details.portId)) throw new Error('This port already has a physical interface.')
  }
  if (details.vlanId && !project.vlans.some((v) => v.id === details.vlanId)) throw new Error('VLAN not found.')
  if (details.address) {
    parseCidr(details.address)
  }
  return changed(project, { interfaces: project.interfaces.map((i) => i.id === id ? { ...i, ...details } : i) })
}

export function deleteInterface(project: Project, id: string): Project {
  requireInterface(project, id)
  return changed(project, {
    interfaces: project.interfaces.filter((i) => i.id !== id),
    notes: project.notes.map((n) => n.attachedTo?.entityType === 'interface' && n.attachedTo.id === id ? { ...n, attachedTo: undefined } : n),
    checklistItems: project.checklistItems.map((c) => c.attachedTo?.entityType === 'interface' && c.attachedTo.id === id ? { ...c, attachedTo: undefined } : c),
    layout: { ...project.layout, logical: Object.fromEntries(Object.entries(project.layout.logical).filter(([key]) => key !== `iface:${id}`)) },
  })
}

export function assignSubnetToVlan(project: Project, subnetId: string, vlanId: string | null): Project {
  requireSubnet(project, subnetId)
  if (vlanId && !project.vlans.some((v) => v.id === vlanId)) throw new Error('VLAN not found.')
  if (vlanId) {
    const otherSubnet = project.subnets.find((s) => s.id !== subnetId && s.vlanId === vlanId)
    if (otherSubnet) throw new Error(`VLAN already assigned to subnet ${otherSubnet.name}.`)
  }
  return changed(project, { subnets: project.subnets.map((s) => s.id === subnetId ? { ...s, vlanId } : s) })
}

export function validateLogical(project: Project): string[] {
  const errors: string[] = []
  const subnetByVlan = new Map<string, Subnet>()
  for (const subnet of project.subnets) {
    if (subnet.vlanId) {
      const existing = subnetByVlan.get(subnet.vlanId)
      if (existing) errors.push(`VLAN ${subnet.vlanId} assigned to multiple subnets: ${existing.name} and ${subnet.name}.`)
      subnetByVlan.set(subnet.vlanId, subnet)
    }
  }
  for (const iface of project.interfaces) {
    if (iface.vlanId && !project.vlans.some((v) => v.id === iface.vlanId)) errors.push(`Interface ${iface.name} references missing VLAN.`)
    if (iface.portId && !project.ports.some((p) => p.id === iface.portId)) errors.push(`Interface ${iface.name} references missing port.`)
    if (iface.address) {
      try { parseCidr(iface.address) } catch { errors.push(`Interface ${iface.name} has invalid address.`) }
    }
  }
  return errors
}

export function moveLogicalNodes(project: Project, positions: Project['layout']['logical']): Project {
  const parsed = projectSchema.shape.layout.shape.logical.parse(positions)
  const ids = new Set([...project.vlans.map((vlan) => `vlan:${vlan.id}`), ...project.subnets.map((subnet) => `subnet:${subnet.id}`), ...project.interfaces.map((iface) => `iface:${iface.id}`)])
  for (const id of Object.keys(parsed)) if (!ids.has(id)) throw new Error('This logical node no longer exists.')
  if (!Object.keys(parsed).length) return project
  return changed(project, { layout: { ...project.layout, logical: { ...project.layout.logical, ...parsed } } })
}
