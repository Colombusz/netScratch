import { z } from 'zod'
import { hardwareItemSchema, allocationSchema, type HardwareItem, type Allocation, type Project, type Device } from './schema'

export const hardwareItemDetailsSchema = hardwareItemSchema.pick({ model: true, category: true, quantityAvailable: true, unitCost: true, portCount: true, capabilities: true })
export const allocationDetailsSchema = allocationSchema.pick({ hardwareItemId: true, deviceId: true, scope: true, quantity: true })

export type HardwareItemDetails = z.infer<typeof hardwareItemDetailsSchema>
export type AllocationDetails = z.infer<typeof allocationDetailsSchema>

function changed(project: Project, patch: Partial<Project>): Project {
  return { ...project, ...patch, updatedAt: new Date().toISOString() }
}

function requireHardwareItem(project: Project, id: string): HardwareItem {
  const item = project.hardwareItems.find((h) => h.id === id)
  if (!item) throw new Error('This hardware item no longer exists.')
  return item
}

function requireAllocation(project: Project, id: string): Allocation {
  const alloc = project.allocations.find((a) => a.id === id)
  if (!alloc) throw new Error('This allocation no longer exists.')
  return alloc
}

export function addHardwareItem(project: Project, input: HardwareItemDetails): Project {
  const details = hardwareItemDetailsSchema.parse(input)
  const item: HardwareItem = { id: crypto.randomUUID(), ...details }
  return changed(project, { hardwareItems: [...project.hardwareItems, item] })
}

export function updateHardwareItem(project: Project, id: string, input: HardwareItemDetails): Project {
  requireHardwareItem(project, id)
  const details = hardwareItemDetailsSchema.parse(input)
  return changed(project, { hardwareItems: project.hardwareItems.map((h) => h.id === id ? { ...h, ...details } : h) })
}

export function deleteHardwareItem(project: Project, id: string): Project {
  requireHardwareItem(project, id)
  const allocated = project.allocations.some((a) => a.hardwareItemId === id)
  if (allocated) throw new Error('Cannot delete hardware item: it has active allocations.')
  return changed(project, {
    hardwareItems: project.hardwareItems.filter((h) => h.id !== id),
    notes: project.notes.map((n) => n.attachedTo?.entityType === 'hardwareItem' && n.attachedTo.id === id ? { ...n, attachedTo: undefined } : n),
    checklistItems: project.checklistItems.map((c) => c.attachedTo?.entityType === 'hardwareItem' && c.attachedTo.id === id ? { ...c, attachedTo: undefined } : c),
  })
}

export function addAllocation(project: Project, input: AllocationDetails): Project {
  const details = allocationDetailsSchema.parse(input)
  const hardwareItem = project.hardwareItems.find((h) => h.id === details.hardwareItemId)
  if (!hardwareItem) throw new Error('Hardware item not found.')
  if (details.deviceId) {
    const device = project.devices.find((d) => d.id === details.deviceId)
    if (!device) throw new Error('Device not found.')
  }
  const alloc: Allocation = { id: crypto.randomUUID(), ...details }
  return changed(project, { allocations: [...project.allocations, alloc] })
}

export function updateAllocation(project: Project, id: string, input: AllocationDetails): Project {
  requireAllocation(project, id)
  const details = allocationDetailsSchema.parse(input)
  const hardwareItem = project.hardwareItems.find((h) => h.id === details.hardwareItemId)
  if (!hardwareItem) throw new Error('Hardware item not found.')
  if (details.deviceId) {
    const device = project.devices.find((d) => d.id === details.deviceId)
    if (!device) throw new Error('Device not found.')
  }
  return changed(project, { allocations: project.allocations.map((a) => a.id === id ? { ...a, ...details } : a) })
}

export function deleteAllocation(project: Project, id: string): Project {
  requireAllocation(project, id)
  return changed(project, {
    allocations: project.allocations.filter((a) => a.id !== id),
    notes: project.notes.map((n) => n.attachedTo?.entityType === 'allocation' && n.attachedTo.id === id ? { ...n, attachedTo: undefined } : n),
    checklistItems: project.checklistItems.map((c) => c.attachedTo?.entityType === 'allocation' && c.attachedTo.id === id ? { ...c, attachedTo: undefined } : c),
  })
}

export function getHardwareSummary(project: Project) {
  const summary = project.hardwareItems.map((item) => {
    const allocations = project.allocations.filter((a) => a.hardwareItemId === item.id)
    const allocatedQty = allocations.reduce((sum, a) => sum + a.quantity, 0)
    const freeQty = item.quantityAvailable - allocatedQty
    const totalCost = item.quantityAvailable * item.unitCost
    const allocatedCost = allocatedQty * item.unitCost
    const isShortage = freeQty < 0
    return {
      item,
      allocatedQty,
      freeQty,
      totalCost,
      allocatedCost,
      isShortage,
      allocations,
    }
  })
  const totalBudget = summary.reduce((sum, s) => sum + s.totalCost, 0)
  const totalAllocatedCost = summary.reduce((sum, s) => sum + s.allocatedCost, 0)
  const hasShortages = summary.some((s) => s.isShortage)
  return { summary, totalBudget, totalAllocatedCost, hasShortages }
}

export function getDevicePortDemand(project: Project, deviceId: string) {
  const device = project.devices.find((d) => d.id === deviceId)
  if (!device) return { demand: 0, supply: 0, shortage: false }
  const ports = project.ports.filter((p) => p.deviceId === deviceId)
  const demand = ports.length
  const allocation = project.allocations.find((a) => a.deviceId === deviceId)
  const hardwareItem = allocation ? project.hardwareItems.find((h) => h.id === allocation.hardwareItemId) : null
  const supply = hardwareItem?.portCount ?? 0
  return { demand, supply, shortage: supply > 0 && demand > supply }
}

export function validateHardware(project: Project): string[] {
  const errors: string[] = []
  for (const alloc of project.allocations) {
    const item = project.hardwareItems.find((h) => h.id === alloc.hardwareItemId)
    if (!item) { errors.push(`Allocation ${alloc.id} references missing hardware item.`); continue }
    if (alloc.deviceId && !project.devices.find((d) => d.id === alloc.deviceId)) {
      errors.push(`Allocation ${alloc.id} references missing device.`)
    }
    const allAllocs = project.allocations.filter((a) => a.hardwareItemId === item.id)
    const totalAllocated = allAllocs.reduce((sum, a) => sum + a.quantity, 0)
    if (totalAllocated > item.quantityAvailable) {
      errors.push(`Hardware item ${item.model} overallocated: ${totalAllocated} of ${item.quantityAvailable}.`)
    }
  }
  for (const device of project.devices) {
    const { demand, supply, shortage } = getDevicePortDemand(project, device.id)
    if (shortage) errors.push(`Device ${device.name}: port demand (${demand}) exceeds hardware supply (${supply}).`)
  }
  return errors
}