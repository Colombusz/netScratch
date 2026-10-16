import { describe, expect, it } from 'vitest'
import { createSampleProject } from './sampleProject'
import { parseProjectJson, serializeProject } from './document'
import { collectIssues } from './issues'

describe('complete sample project', () => {
  it('round-trips a connected plan with valid references and exactly the documented purchase warning', () => {
    const project = createSampleProject()
    expect(parseProjectJson(serializeProject(project))).toEqual(project)
    expect(project.devices).toHaveLength(8)
    expect(project.links).toHaveLength(7)
    expect(project.addressSpaces).toHaveLength(2)
    expect(project.subnets.some((s) => s.status === 'reserved')).toBe(true)
    expect(new Set(project.interfaces.map((i) => i.kind))).toEqual(new Set(['physical', 'subinterface', 'SVI', 'loopback']))
    expect(new Set(project.checklistItems.map((i) => i.status))).toEqual(new Set(['todo', 'doing', 'done']))
    expect(project.allocations.some((a) => a.scope === 'Branch')).toBe(true)
    expect(collectIssues(project)).toMatchObject([{ code: 'hardware-stock', severity: 'warning', entities: [{ entityType: 'hardwareItem', id: 'sample-hardware-ap' }] }])
    expect(Object.keys(project.layout.physical)).toHaveLength(project.devices.length)
    expect(Object.keys(project.layout.logical)).toHaveLength(project.vlans.length + project.subnets.length + project.interfaces.length)
    const reachable = new Set([project.devices[0]!.id])
    for (let i = 0; i < project.devices.length; i++) for (const link of project.links) {
      const a = project.ports.find((p) => p.id === link.sourcePortId)!.deviceId
      const b = project.ports.find((p) => p.id === link.targetPortId)!.deviceId
      if (reachable.has(a)) reachable.add(b)
      if (reachable.has(b)) reachable.add(a)
    }
    expect(reachable.size).toBe(project.devices.length)
  })
  it('creates fresh documents without sharing mutable example data', () => {
    const first = createSampleProject(), second = createSampleProject()
    expect(second.id).not.toBe(first.id)
    expect(first.notes[0]!.attachedTo!.id).toBe(first.id)
    expect(second.notes[0]!.attachedTo!.id).toBe(second.id)
    first.devices[0]!.name = 'Edited device'
    first.ports[1]!.trunkVlanIds.length = 0
    expect(second.devices[0]!.name).toBe('Office edge router')
    expect(second.ports[1]!.trunkVlanIds).toHaveLength(4)
  })
})
