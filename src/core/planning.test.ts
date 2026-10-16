import { describe, expect, it } from 'vitest'
import { applyPlan, deleteAddressSpace, generatePlan, validateSubnets } from './planning'
import { createEmptyProject, type AddressSpace, type Subnet } from './schema'

const space: AddressSpace = { id: 'space', name: 'Office', parentCidr: '192.168.10.0/24', scope: 'HQ' }
const subnet = (patch: Partial<Subnet> = {}): Subnet => ({ id: 'staff', addressSpaceId: space.id, name: 'Staff', cidr: '192.168.10.0/25', status: 'allocated', hostRequirement: 100, gatewayIp: '192.168.10.1', vlanId: null, source: 'auto', notes: '', ...patch })

describe('project planning transactions', () => {
  it('deletes one address space atomically, detaches writing, and removes only its logical positions', () => {
    let project = applyPlan(createEmptyProject(), space, [subnet()])
    project = applyPlan(project, { ...space, id: 'branch', scope: 'Branch' }, [subnet({ id: 'branch-subnet', addressSpaceId: 'branch' })])
    project.notes = [{ id: 'note', text: 'Keep', attachedTo: { entityType: 'addressSpace', id: space.id } }, { id: 'unattached', text: 'Project' }]
    project.checklistItems = [{ id: 'task', task: 'Keep task', status: 'todo', attachedTo: { entityType: 'subnet', id: 'staff' } }]
    project.layout.logical = { 'subnet:staff': { x: 1, y: 1 }, 'subnet:branch-subnet': { x: 2, y: 2 } }
    const next = deleteAddressSpace(project, space.id)
    expect(next.subnets.map((s) => s.id)).toEqual(['branch-subnet'])
    expect(next.notes[0]!.attachedTo).toBeUndefined(); expect(next.notes[1]).toBe(project.notes[1])
    expect(next.checklistItems[0]!.attachedTo).toBeUndefined()
    expect(next.layout.logical).toEqual({ 'subnet:branch-subnet': { x: 2, y: 2 } })
    expect(project.subnets).toHaveLength(2)
    expect(() => deleteAddressSpace(project, 'missing')).toThrow('no longer exists')
    expect(applyPlan(project, space, []).layout.logical).toEqual({ 'subnet:branch-subnet': { x: 2, y: 2 } })
  })
  it('applies a plan without mutating the prior project', () => {
    const project = createEmptyProject()
    const next = applyPlan(project, space, [subnet()])
    expect(project.addressSpaces).toEqual([])
    expect(project.subnets).toEqual([])
    expect(next.subnets[0]?.id).toBe('staff')
    const renamed = applyPlan(next, space, [subnet({ name: 'Employees' })])
    expect(renamed.subnets[0]?.id).toBe('staff')
  })
  it.each([
    { cidr: 'invalid' }, { cidr: '192.168.10.1/25' }, { cidr: '192.168.11.0/25' },
    { gatewayIp: '192.168.10.0' }, { gatewayIp: '192.168.10.127' }, { gatewayIp: '192.168.11.1' },
    { gatewayIp: '999.0.0.1' }, { hostRequirement: 127 }, { hostRequirement: 0 }, { addressSpaceId: 'missing' },
  ])('rejects invalid manual changes atomically: %j', (patch) => {
    const project = applyPlan(createEmptyProject(), space, [subnet()])
    const before = structuredClone(project)
    expect(() => applyPlan(project, space, [subnet(patch)])).toThrow()
    expect(project).toEqual(before)
  })
  it('rejects a parent shrink that excludes an existing subnet', () => {
    const project = applyPlan(createEmptyProject(), space, [subnet()])
    expect(() => applyPlan(project, { ...space, parentCidr: '192.168.10.0/26' }, project.subnets)).toThrow('outside parent')
  })
  it('detects overlaps across address spaces in the same scope, including reserved ranges', () => {
    const another = { ...space, id: 'other' }
    const a = subnet()
    const b = subnet({ id: 'other-subnet', addressSpaceId: 'other', status: 'reserved', hostRequirement: 0, gatewayIp: null })
    expect(validateSubnets([space, another], [a, b])).toEqual([expect.stringContaining('overlaps')])
    expect(validateSubnets([space, { ...another, scope: 'Branch' }], [a, b])).toEqual([])
    expect(validateSubnets([space], [subnet({ cidr: '192.168.10.0/31', hostRequirement: 2, gatewayIp: '192.168.10.0' })])).toEqual([])
  })
  it('preserves other address spaces and rejects overlap when applying scope changes', () => {
    const otherSpace = { ...space, id: 'other', scope: 'Branch' }
    let project = applyPlan(createEmptyProject(), space, [subnet()])
    project = applyPlan(project, otherSpace, [subnet({ id: 'branch', addressSpaceId: 'other' })])
    expect(project.subnets).toHaveLength(2)
    expect(() => applyPlan(project, { ...otherSpace, scope: 'HQ' }, project.subnets.filter((s) => s.addressSpaceId === 'other'))).toThrow('overlaps')
  })
  it('regenerates automatic blocks, preserves IDs and metadata, and keeps manual and reserved blocks', () => {
    const fixed = subnet({ id: 'fixed', name: 'Fixed', cidr: '192.168.10.128/26', hostRequirement: 50, gatewayIp: '192.168.10.129', source: 'manual' })
    const reserved = subnet({ id: 'reserve', name: 'Future', cidr: '192.168.10.224/27', status: 'reserved', hostRequirement: 0, gatewayIp: null, source: 'manual' })
    const project = applyPlan(createEmptyProject(), space, [subnet({ notes: 'Preserve this', vlanId: 'vlan' }), fixed, reserved])
    const result = generatePlan(project, space, [{ id: 'staff', name: 'Staff', hosts: 100 }, { id: 'fixed', name: 'Fixed', hosts: 50 }])
    expect(result.project.subnets).toContainEqual(fixed)
    expect(result.project.subnets).toContainEqual(reserved)
    expect(result.project.subnets.find((s) => s.id === 'staff')).toMatchObject({ notes: 'Preserve this', vlanId: 'vlan', cidr: '192.168.10.0/25' })
    expect(result.free).toEqual(['192.168.10.192/27'])
    expect(project.subnets).toHaveLength(3)
  })
  it('exposes partial allocation failures while creating a valid document', () => {
    const result = generatePlan(createEmptyProject(), space, ['a', 'b', 'c'].map((id) => ({ id, name: id, hosts: 100 })))
    expect(result.project.subnets).toHaveLength(2)
    expect(result.failures).toHaveLength(1)
    expect(validateSubnets(result.project.addressSpaces, result.project.subnets)).toEqual([])
  })
})
