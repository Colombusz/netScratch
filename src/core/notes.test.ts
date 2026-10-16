import { describe, expect, it } from 'vitest'
import { createEmptyProject, projectSchema, type Project } from './schema'
import { addNote, updateNote, deleteNote, addChecklistItem, updateChecklistItem, deleteChecklistItem, setChecklistStatus, getAttachmentTargets, attachmentKey, attachmentLabel, type Attachment } from './notes'
import { deleteDevice } from './topology'
import { applyPlan } from './planning'

function fixture(): Project {
  const project = createEmptyProject()
  project.addressSpaces = [{ id: 'space', name: 'Office', parentCidr: '10.0.0.0/24', scope: 'HQ' }]
  project.subnets = [{ id: 'subnet', addressSpaceId: 'space', name: 'Staff', cidr: '10.0.0.0/25', status: 'allocated', hostRequirement: 100, gatewayIp: '10.0.0.1', vlanId: 'vlan', source: 'manual', notes: '' }]
  project.vlans = [{ id: 'vlan', number: 10, name: 'Staff' }]
  project.devices = [{ id: 'device', name: 'Core', role: 'switch', hardwareItemId: null, scope: 'HQ', notes: '' }]
  project.ports = [{ id: 'port', deviceId: 'device', name: 'eth0', speed: '1 Gbps', media: 'copper', mode: 'unused', accessVlanId: null, trunkVlanIds: [] }]
  project.interfaces = [{ id: 'interface', deviceId: 'device', name: 'LAN', kind: 'physical', portId: 'port', vlanId: 'vlan', address: '10.0.0.1/25' }]
  project.links = [{ id: 'link', sourcePortId: 'port', targetPortId: 'other-port', cableType: 'Cat6', label: 'Uplink' }]
  project.hardwareItems = [{ id: 'hardware', model: 'Switch model', category: 'Switch', quantityAvailable: 1, unitCost: 10, portCount: 8, capabilities: [] }]
  project.allocations = [{ id: 'allocation', hardwareItemId: 'hardware', deviceId: 'device', scope: null, quantity: 1 }, { id: 'site-allocation', hardwareItemId: 'hardware', deviceId: null, scope: 'Branch', quantity: 1 }]
  project.notes = [{ id: 'existing-note', text: 'Existing note' }]
  project.checklistItems = [{ id: 'existing-task', task: 'Existing task', status: 'todo' }]
  return project
}

describe('notes and checklist transactions', () => {
  it('adds notes for every attachment type with stable IDs and plain multiline text', () => {
    const project = fixture()
    const snapshot = structuredClone(project)
    for (const { attachment } of getAttachmentTargets(project)) {
      const next = addNote(project, { text: '  Check uplink\nConfirm VLAN 10  ', attachedTo: attachment })
      const note = next.notes.at(-1)!
      expect(note.text).toBe('Check uplink\nConfirm VLAN 10')
      expect(note.attachedTo).toEqual(attachment)
      expect(note.id).not.toBe('existing-note')
      expect(projectSchema.safeParse(next).success).toBe(true)
    }
    expect(project).toEqual(snapshot)
  })

  it('edits content and attachments and explicitly clears a prior attachment', () => {
    const project = addNote(fixture(), { text: 'Original', attachedTo: { entityType: 'device', id: 'device' } })
    const id = project.notes.at(-1)!.id
    const updated = updateNote(project, id, { text: 'Updated', attachedTo: { entityType: 'subnet', id: 'subnet' } })
    expect(updated.notes.at(-1)).toEqual({ id, text: 'Updated', attachedTo: { entityType: 'subnet', id: 'subnet' } })
    const cleared = updateNote(updated, id, { text: 'Unattached' })
    expect(cleared.notes.at(-1)!.attachedTo).toBeUndefined()
    expect(cleared.notes[0]).toEqual(project.notes[0])
    expect(project.notes.at(-1)!.text).toBe('Original')
  })

  it('creates, reassigns, and transitions tasks through all statuses without losing their IDs', () => {
    let project = addChecklistItem(fixture(), { task: ' Configure uplink ', status: 'todo', attachedTo: { entityType: 'device', id: 'device' } })
    const id = project.checklistItems.at(-1)!.id
    for (const status of ['doing', 'done', 'todo'] as const) {
      project = setChecklistStatus(project, id, status)
      expect(project.checklistItems.at(-1)).toMatchObject({ id, task: 'Configure uplink', status, attachedTo: { entityType: 'device', id: 'device' } })
    }
    project = updateChecklistItem(project, id, { task: 'Verify gateway', status: 'doing', attachedTo: { entityType: 'subnet', id: 'subnet' } })
    expect(project.checklistItems.at(-1)!.attachedTo?.entityType).toBe('subnet')
    project = updateChecklistItem(project, id, { task: 'Verify gateway', status: 'done' })
    expect(project.checklistItems.at(-1)!.attachedTo).toBeUndefined()
    expect(project.checklistItems[0]!.id).toBe('existing-task')
    expect(projectSchema.safeParse(project).success).toBe(true)
  })

  it('rejects blank content, invalid statuses and stale or incorrectly typed targets atomically', () => {
    const project = fixture()
    const snapshot = structuredClone(project)
    for (const text of ['', ' \n ']) {
      expect(() => addNote(project, { text })).toThrow('Write a note')
      expect(() => updateNote(project, 'existing-note', { text })).toThrow()
      expect(() => addChecklistItem(project, { task: text, status: 'todo' })).toThrow()
      expect(() => updateChecklistItem(project, 'existing-task', { task: text, status: 'done' })).toThrow()
    }
    for (const attachedTo of [{ entityType: 'device', id: 'missing' }, { entityType: 'subnet', id: 'device' }] as Attachment[]) {
      expect(() => addNote(project, { text: 'Note', attachedTo })).toThrow('no longer exists')
      expect(() => addChecklistItem(project, { task: 'Task', status: 'todo', attachedTo })).toThrow('no longer exists')
    }
    expect(() => setChecklistStatus(project, 'existing-task', 'invalid' as never)).toThrow()
    expect(() => addChecklistItem(project, { task: 'Task', status: 'invalid' as never })).toThrow()
    expect(project).toEqual(snapshot)
  })

  it('rejects operations on deleted entries', () => {
    const project = fixture()
    expect(() => updateNote(project, 'missing', { text: 'Note' })).toThrow('no longer exists')
    expect(() => updateChecklistItem(project, 'missing', { task: 'Task', status: 'todo' })).toThrow('no longer exists')
    expect(() => setChecklistStatus(project, 'missing', 'doing')).toThrow('no longer exists')
    expect(() => deleteNote(project, 'missing')).toThrow('no longer exists')
    expect(() => deleteChecklistItem(project, 'missing')).toThrow('no longer exists')
  })

  it('rejects self links and indirect cycles across notes and tasks', () => {
    let project = fixture()
    expect(() => updateNote(project, 'existing-note', { text: 'Self', attachedTo: { entityType: 'note', id: 'existing-note' } })).toThrow('circular')
    expect(() => updateChecklistItem(project, 'existing-task', { task: 'Self', status: 'todo', attachedTo: { entityType: 'checklistItem', id: 'existing-task' } })).toThrow('circular')
    project = updateNote(project, 'existing-note', { text: 'Depends on task', attachedTo: { entityType: 'checklistItem', id: 'existing-task' } })
    expect(() => updateChecklistItem(project, 'existing-task', { task: 'Cycle', status: 'todo', attachedTo: { entityType: 'note', id: 'existing-note' } })).toThrow('circular')
    project.checklistItems[0]!.attachedTo = { entityType: 'note', id: 'existing-note' }
    expect(() => addNote(project, { text: 'Imported cycle', attachedTo: { entityType: 'note', id: 'existing-note' } })).toThrow('circular')
  })

  it.each(['note', 'checklistItem'] as const)('deletes a %s while preserving and detaching related writing', (kind) => {
    let project = fixture()
    const id = kind === 'note' ? 'existing-note' : 'existing-task'
    const attachment = { entityType: kind, id }
    project = addNote(project, { text: 'Related note', attachedTo: attachment })
    project = addChecklistItem(project, { task: 'Related task', status: 'doing', attachedTo: attachment })
    project = kind === 'note' ? deleteNote(project, id) : deleteChecklistItem(project, id)
    expect(project.notes.at(-1)!.text).toBe('Related note')
    expect(project.notes.at(-1)!.attachedTo).toBeUndefined()
    expect(project.checklistItems.at(-1)!.task).toBe('Related task')
    expect(project.checklistItems.at(-1)!.status).toBe('doing')
    expect(project.checklistItems.at(-1)!.attachedTo).toBeUndefined()
    expect([...project.notes, ...project.checklistItems].some((item) => item.id === id)).toBe(false)
  })

  it('preserves note and task content when devices and dependent entities are removed', () => {
    let project = fixture()
    for (const [entityType, id] of [['device', 'device'], ['port', 'port'], ['interface', 'interface'], ['allocation', 'allocation']] as const) {
      project = addNote(project, { text: `Keep ${entityType}`, attachedTo: { entityType, id } })
      project = addChecklistItem(project, { task: `Check ${entityType}`, status: 'doing', attachedTo: { entityType, id } })
    }
    const next = deleteDevice(project, 'device')
    expect(next.notes.slice(1).every((note) => !note.attachedTo)).toBe(true)
    expect(next.checklistItems.slice(1).every((task) => !task.attachedTo && task.status === 'doing')).toBe(true)
    expect(next.notes).toHaveLength(5)
    expect(next.checklistItems).toHaveLength(5)
  })

  it('detaches writing when a subnet is deleted or omitted by a replacement plan', () => {
    let project = addNote(fixture(), { text: 'Subnet decision', attachedTo: { entityType: 'subnet', id: 'subnet' } })
    project = addChecklistItem(project, { task: 'Subnet check', status: 'doing', attachedTo: { entityType: 'subnet', id: 'subnet' } })
    project = addNote(project, { text: 'Device decision', attachedTo: { entityType: 'device', id: 'device' } })
    const next = applyPlan(project, project.addressSpaces[0]!, [])
    expect(next.notes.find((note) => note.text === 'Subnet decision')!.attachedTo).toBeUndefined()
    expect(next.checklistItems.at(-1)!.attachedTo).toBeUndefined()
    expect(next.notes.at(-1)!.attachedTo?.id).toBe('device')
    expect(next.notes).toHaveLength(project.notes.length)
  })
})

describe('attachment labels', () => {
  it('identifies targets and handles absent targets without hiding writing', () => {
    const project = fixture()
    const targets = getAttachmentTargets(project)
    expect(new Set(targets.map((target) => target.attachment.entityType)).size).toBe(12)
    expect(attachmentKey()).toBe('')
    expect(attachmentLabel(project)).toBe('Whole project (unattached)')
    expect(attachmentLabel(project, { entityType: 'device', id: 'device' })).toBe('Device: Core (HQ)')
    expect(attachmentLabel(project, { entityType: 'device', id: 'missing' })).toContain('Missing attachment')
    project.links[0]!.label = ''
    project.devices = []
    project.hardwareItems = []
    expect(getAttachmentTargets(project).find((target) => target.attachment.entityType === 'link')!.label).toContain('Cat6')
    expect(getAttachmentTargets(project).find((target) => target.attachment.entityType === 'allocation')!.label).toContain('Missing hardware / Missing device')
  })
})
