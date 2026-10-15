import { describe, expect, it } from 'vitest'
import {
  addHardwareItem,
  deleteHardwareItem,
  updateHardwareItem,
  addAllocation,
  updateAllocation,
  deleteAllocation,
  getHardwareSummary,
  getDevicePortDemand,
  validateHardware,
} from './hardware'
import { createEmptyProject, type Project, type HardwareItem, type Allocation } from './schema'

function makeProject(): Project {
  let project = createEmptyProject()
  project = {
    ...project,
    devices: [{ id: 'router1', name: 'Router', role: 'router', hardwareItemId: null, scope: 'HQ', notes: '' }],
  }
  return project
}

function addRouterHardware(project: Project): { project: Project; hardware: HardwareItem } {
  const hw = addHardwareItem(project, {
    model: 'ISR 4331',
    category: 'router',
    quantityAvailable: 2,
    unitCost: 3500,
    portCount: 4,
    capabilities: ['routing', 'vpn'],
  })
  return { project: hw, hardware: hw.hardwareItems.at(-1)! }
}

function addSwitchHardware(project: Project): { project: Project; hardware: HardwareItem } {
  const hw = addHardwareItem(project, {
    model: 'Catalyst 9300',
    category: 'switch',
    quantityAvailable: 5,
    unitCost: 8000,
    portCount: 24,
    capabilities: ['switching', 'stacking'],
  })
  return { project: hw, hardware: hw.hardwareItems.at(-1)! }
}

describe('hardware inventory transactions', () => {
  it('adds hardware items with stable IDs', () => {
    let project = makeProject()
    const { project: p1, hardware: h1 } = addRouterHardware(project)
    expect(p1.hardwareItems).toHaveLength(1)
    expect(h1.id).toBeDefined()
    expect(h1.model).toBe('ISR 4331')
    expect(h1.quantityAvailable).toBe(2)
    expect(h1.unitCost).toBe(3500)
    expect(h1.portCount).toBe(4)

    const { project: p2, hardware: h2 } = addSwitchHardware(p1)
    expect(p2.hardwareItems).toHaveLength(2)
    expect(h2.id).not.toBe(h1.id)
  })

  it('updates hardware item details', () => {
    let project = makeProject()
    const { project: p1, hardware } = addRouterHardware(project)
    const updated = updateHardwareItem(p1, hardware.id, {
      model: 'ISR 4351',
      category: 'router',
      quantityAvailable: 3,
      unitCost: 4200,
      portCount: 8,
      capabilities: ['routing', 'vpn', 'sd-wan'],
    })
    expect(updated.hardwareItems.find((h) => h.id === hardware.id)?.model).toBe('ISR 4351')
    expect(updated.hardwareItems.find((h) => h.id === hardware.id)?.quantityAvailable).toBe(3)
    expect(updated.hardwareItems.find((h) => h.id === hardware.id)?.capabilities).toEqual(['routing', 'vpn', 'sd-wan'])
  })

  it('rejects updates to missing hardware', () => {
    const project = makeProject()
    expect(() => updateHardwareItem(project, 'missing', {
      model: 'X', category: 'router', quantityAvailable: 1, unitCost: 100, portCount: 1, capabilities: [],
    })).toThrow('no longer exists')
  })

  it('deletes hardware item without allocations', () => {
    let project = makeProject()
    const { project: p1, hardware } = addRouterHardware(project)
    const deleted = deleteHardwareItem(p1, hardware.id)
    expect(deleted.hardwareItems).toHaveLength(0)
  })

  it('prevents deletion of hardware with active allocations', () => {
    let project = makeProject()
    const { project: p1, hardware } = addRouterHardware(project)
    const { project: p2 } = addAllocation(p1, { hardwareItemId: hardware.id, deviceId: 'router1', scope: null, quantity: 1 })
    expect(() => deleteHardwareItem(p2, hardware.id)).toThrow('active allocations')
  })
it('adds allocations to device or scope', () => {
    let project = makeProject()
    const { project: p1, hardware } = addRouterHardware(project)
    const { project: p2, allocation: a1 } = addAllocation(p1, { hardwareItemId: hardware.id, deviceId: 'router1', scope: null, quantity: 1 })
    expect(p2.allocations).toHaveLength(1)
    expect(a1.deviceId).toBe('router1')
    expect(a1.scope).toBeNull()

    const { project: p3, allocation: a2 } = addAllocation(p2, { hardwareItemId: hardware.id, deviceId: null, scope: 'HQ', quantity: 1 })
    expect(p3.allocations).toHaveLength(2)
    expect(a2.deviceId).toBeNull()
    expect(a2.scope).toBe('HQ')
  })

  it('rejects allocation to missing hardware or device', () => {
    let project = makeProject()
    const { project: p1, hardware } = addRouterHardware(project)
    expect(() => addAllocation(p1, { hardwareItemId: 'missing', deviceId: 'router1', scope: null, quantity: 1 })).toThrow('Hardware item not found')
    expect(() => addAllocation(p1, { hardwareItemId: hardware.id, deviceId: 'missing', scope: null, quantity: 1 })).toThrow('Device not found')
  })

  it('rejects allocation with both deviceId and scope, or neither', () => {
    let project = makeProject()
    const { project: p1, hardware } = addRouterHardware(project)
    expect(() => addAllocation(p1, { hardwareItemId: hardware.id, deviceId: 'router1', scope: 'HQ', quantity: 1 })).toThrow()
    expect(() => addAllocation(p1, { hardwareItemId: hardware.id, deviceId: null, scope: null, quantity: 1 })).toThrow()
  })

  it('updates and deletes allocations', () => {
    let project = makeProject()
    const { project: p1, hardware } = addRouterHardware(project)
    const { project: p2, allocation } = addAllocation(p1, { hardwareItemId: hardware.id, deviceId: 'router1', scope: null, quantity: 1 })
    const updated = updateAllocation(p2, allocation.id, { hardwareItemId: hardware.id, deviceId: 'router1', scope: null, quantity: 2 })
    expect(updated.allocations.find((a) => a.id === allocation.id)?.quantity).toBe(2)

    const deleted = deleteAllocation(updated, allocation.id)
    expect(deleted.allocations).toHaveLength(0)
  })

  it('cleans up notes and checklist items on hardware/allocation deletion', () => {
    let project = makeProject()
    const { project: p1, hardware } = addRouterHardware(project)
    const { project: p2, allocation } = addAllocation(p1, { hardwareItemId: hardware.id, deviceId: 'router1', scope: null, quantity: 1 })
    const withNotes = {
      ...p2,
      notes: [
        { id: 'n1', text: 'Hardware note', attachedTo: { entityType: 'hardwareItem' as const, id: hardware.id } },
        { id: 'n2', text: 'Allocation note', attachedTo: { entityType: 'allocation' as const, id: allocation.id } },
        { id: 'n3', text: 'Standalone note' },
      ],
      checklistItems: [
        { id: 'c1', task: 'Check hardware', status: 'todo', attachedTo: { entityType: 'hardwareItem' as const, id: hardware.id } },
        { id: 'c2', task: 'Check allocation', status: 'doing', attachedTo: { entityType: 'allocation' as const, id: allocation.id } },
        { id: 'c3', task: 'Standalone', status: 'done' },
      ],
    }
    const deletedHw = deleteHardwareItem(withNotes, hardware.id)
    expect(deletedHw.hardwareItems).toHaveLength(0)
    expect(deletedHw.notes.find((n) => n.id === 'n1')?.attachedTo).toBeUndefined()
    expect(deletedHw.checklistItems.find((c) => c.id === 'c1')?.attachedTo).toBeUndefined()
    expect(deletedHw.notes.find((n) => n.id === 'n2')?.attachedTo?.id).toBe(allocation.id)
    expect(deletedHw.checklistItems.find((c) => c.id === 'c2')?.attachedTo?.id).toBe(allocation.id)

    const deletedAlloc = deleteAllocation(deletedHw, allocation.id)
    expect(deletedAlloc.notes.find((n) => n.id === 'n2')?.attachedTo).toBeUndefined()
    expect(deletedAlloc.checklistItems.find((c) => c.id === 'c2')?.attachedTo).toBeUndefined()
  })
})
describe('hardware summary and validation', () => {
  it('computes hardware summary with costs and shortages', () => {
    let project = makeProject()
    const { project: p1, hardware: router } = addRouterHardware(project)
    const { project: p2, hardware: sw } = addSwitchHardware(p1)

    const { project: p3 } = addAllocation(p2, { hardwareItemId: router.id, deviceId: 'router1', scope: null, quantity: 1 })
    const { project: p4 } = addAllocation(p3, { hardwareItemId: sw.id, deviceId: null, scope: 'HQ', quantity: 3 })

    const summary = getHardwareSummary(p4)
    expect(summary.summary).toHaveLength(2)

    const routerSummary = summary.summary.find((s) => s.item.id === router.id)!
    expect(routerSummary.allocatedQty).toBe(1)
    expect(routerSummary.freeQty).toBe(1)
    expect(routerSummary.totalCost).toBe(7000)
    expect(routerSummary.allocatedCost).toBe(3500)
    expect(routerSummary.isShortage).toBe(false)

    const swSummary = summary.summary.find((s) => s.item.id === sw.id)!
    expect(swSummary.allocatedQty).toBe(3)
    expect(swSummary.freeQty).toBe(2)
    expect(swSummary.totalCost).toBe(40000)
    expect(swSummary.allocatedCost).toBe(24000)

    expect(summary.totalBudget).toBe(47000)
    expect(summary.totalAllocatedCost).toBe(27500)
    expect(summary.hasShortages).toBe(false)
  })

  it('detects overallocation shortage', () => {
    let project = makeProject()
    const { project: p1, hardware } = addRouterHardware(project)
    const { project: p2 } = addAllocation(p1, { hardwareItemId: hardware.id, deviceId: 'router1', scope: null, quantity: 3 })
    const summary = getHardwareSummary(p2)
    expect(summary.summary[0].isShortage).toBe(true)
    expect(summary.hasShortages).toBe(true)
  })

  it('computes device port demand', () => {
    let project = makeProject()
    const { project: p1, hardware } = addRouterHardware(project)
    const { project: p2 } = addAllocation(p1, { hardwareItemId: hardware.id, deviceId: 'router1', scope: null, quantity: 1 })
    p2.ports = [
      { id: 'p1', deviceId: 'router1', name: 'Gi0/0', speed: '1 Gbps', media: 'copper', mode: 'routed', accessVlanId: null, trunkVlanIds: [] },
      { id: 'p2', deviceId: 'router1', name: 'Gi0/1', speed: '1 Gbps', media: 'copper', mode: 'routed', accessVlanId: null, trunkVlanIds: [] },
    ]
    const demand = getDevicePortDemand(p2, 'router1')
    expect(demand.demand).toBe(2)
    expect(demand.supply).toBe(4)
    expect(demand.shortage).toBe(false)
  })

  it('detects port shortage on device', () => {
    let project = makeProject()
    const { project: p1, hardware } = addRouterHardware(project)
    const { project: p2 } = addAllocation(p1, { hardwareItemId: hardware.id, deviceId: 'router1', scope: null, quantity: 1 })
    p2.ports = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, deviceId: 'router1', name: `Gi0/${i}`, speed: '1 Gbps', media: 'copper', mode: 'routed', accessVlanId: null, trunkVlanIds: [],
    }))
    const demand = getDevicePortDemand(p2, 'router1')
    expect(demand.demand).toBe(5)
    expect(demand.supply).toBe(4)
    expect(demand.shortage).toBe(true)
  })

  it('validates hardware allocations and port demands', () => {
    let project = makeProject()
    const { project: p1, hardware } = addRouterHardware(project)
    const { project: p2 } = addAllocation(p1, { hardwareItemId: hardware.id, deviceId: 'router1', scope: null, quantity: 3 })
    p2.ports = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, deviceId: 'router1', name: `Gi0/${i}`, speed: '1 Gbps', media: 'copper', mode: 'routed', accessVlanId: null, trunkVlanIds: [],
    }))
    const errors = validateHardware(p2)
    expect(errors).toContainEqual(expect.stringContaining('overallocated'))
    expect(errors).toContainEqual(expect.stringContaining('port demand'))
  })

  it('validates missing references', () => {
    let project = makeProject()
    const { project: p1, hardware } = addRouterHardware(project)
    const { project: p2 } = addAllocation(p1, { hardwareItemId: hardware.id, deviceId: 'router1', scope: null, quantity: 1 })
    p2.devices = []
    const errors = validateHardware(p2)
    expect(errors).toContainEqual(expect.stringContaining('missing device'))
  })
})
})