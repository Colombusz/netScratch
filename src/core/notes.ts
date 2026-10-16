import { z } from 'zod'
import { noteSchema, checklistItemSchema, type Project, type Note, type ChecklistItem } from './schema'

export type Attachment = NonNullable<Note['attachedTo']>
export const noteDetailsSchema = noteSchema.pick({ text: true, attachedTo: true }).extend({ text: z.string().trim().min(1, 'Write a note before saving.') })
export const checklistDetailsSchema = checklistItemSchema.pick({ task: true, status: true, attachedTo: true })
export type NoteDetails = z.infer<typeof noteDetailsSchema>
export type ChecklistDetails = z.infer<typeof checklistDetailsSchema>

export function getAttachmentTargets(project: Project): { attachment: Attachment; label: string }[] {
  const target = (entityType: Attachment['entityType'], id: string, label: string) => ({ attachment: { entityType, id }, label })
  const deviceName = (id: string) => project.devices.find((device) => device.id === id)?.name ?? 'Missing device'
  return [
    target('project', project.id, 'Whole project'),
    ...project.addressSpaces.map((item) => target('addressSpace', item.id, `Address space: ${item.name} (${item.parentCidr})`)),
    ...project.vlans.map((item) => target('vlan', item.id, `VLAN: ${item.number} / ${item.name}`)),
    ...project.subnets.map((item) => target('subnet', item.id, `Subnet: ${item.name} (${item.cidr})`)),
    ...project.devices.map((item) => target('device', item.id, `Device: ${item.name} (${item.scope})`)),
    ...project.ports.map((item) => target('port', item.id, `Port: ${deviceName(item.deviceId)} / ${item.name}`)),
    ...project.interfaces.map((item) => target('interface', item.id, `Interface: ${deviceName(item.deviceId)} / ${item.name}`)),
    ...project.links.map((item) => target('link', item.id, `Cable: ${item.label || item.cableType} (${item.id})`)),
    ...project.hardwareItems.map((item) => target('hardwareItem', item.id, `Hardware: ${item.model}`)),
    ...project.allocations.map((item) => {
      const model = project.hardwareItems.find((hardware) => hardware.id === item.hardwareItemId)?.model ?? 'Missing hardware'
      return target('allocation', item.id, `Allocation: ${model} / ${item.deviceId ? deviceName(item.deviceId) : item.scope}`)
    }),
    ...project.notes.map((item) => target('note', item.id, `Note: ${item.text.slice(0, 80)}`)),
    ...project.checklistItems.map((item) => target('checklistItem', item.id, `Task: ${item.task}`)),
  ]
}

export function attachmentKey(attachment?: Attachment): string {
  return attachment ? `${attachment.entityType}:${attachment.id}` : ''
}

export function attachmentLabel(project: Project, attachment?: Attachment): string {
  if (!attachment) return 'Whole project (unattached)'
  return getAttachmentTargets(project).find((target) => attachmentKey(target.attachment) === attachmentKey(attachment))?.label ?? `Missing attachment (${attachment.entityType}: ${attachment.id})`
}

function validateAttachment(project: Project, attachment: Attachment | undefined, ownId?: string) {
  if (!attachment) return
  if (!getAttachmentTargets(project).some((target) => attachmentKey(target.attachment) === attachmentKey(attachment))) throw new Error('The attachment target no longer exists. Choose another target or leave it unattached.')
  let current: Attachment | undefined = attachment
  const visited = new Set<string>()
  while (current && (current.entityType === 'note' || current.entityType === 'checklistItem')) {
    const key = attachmentKey(current)
    if (current.id === ownId || visited.has(key)) throw new Error('Notes and tasks cannot have circular attachments.')
    visited.add(key)
    const currentId: string = current.id
    const items: (Note | ChecklistItem)[] = current.entityType === 'note' ? project.notes : project.checklistItems
    current = items.find((item) => item.id === currentId)?.attachedTo
  }
}

function changed(project: Project, patch: Partial<Project>): Project {
  return { ...project, ...patch, updatedAt: new Date().toISOString() }
}

export function addNote(project: Project, input: NoteDetails): Project {
  const details = noteDetailsSchema.parse(input)
  validateAttachment(project, details.attachedTo)
  return changed(project, { notes: [...project.notes, { id: crypto.randomUUID(), ...details }] })
}

export function updateNote(project: Project, id: string, input: NoteDetails): Project {
  if (!project.notes.some((note) => note.id === id)) throw new Error('This note no longer exists.')
  const details = noteDetailsSchema.parse(input)
  validateAttachment(project, details.attachedTo, id)
  return changed(project, { notes: project.notes.map((note) => note.id === id ? { id, ...details } : note) })
}

export function addChecklistItem(project: Project, input: ChecklistDetails): Project {
  const details = checklistDetailsSchema.parse(input)
  validateAttachment(project, details.attachedTo)
  return changed(project, { checklistItems: [...project.checklistItems, { id: crypto.randomUUID(), ...details }] })
}

export function updateChecklistItem(project: Project, id: string, input: ChecklistDetails): Project {
  if (!project.checklistItems.some((item) => item.id === id)) throw new Error('This task no longer exists.')
  const details = checklistDetailsSchema.parse(input)
  validateAttachment(project, details.attachedTo, id)
  return changed(project, { checklistItems: project.checklistItems.map((item) => item.id === id ? { id, ...details } : item) })
}

export function setChecklistStatus(project: Project, id: string, status: ChecklistItem['status']): Project {
  const item = project.checklistItems.find((entry) => entry.id === id)
  if (!item) throw new Error('This task no longer exists.')
  const parsedStatus = checklistItemSchema.shape.status.parse(status)
  return changed(project, { checklistItems: project.checklistItems.map((entry) => entry.id === id ? { ...entry, status: parsedStatus } : entry) })
}

function deleteEntry(project: Project, kind: 'note' | 'checklistItem', id: string): Project {
  const items = kind === 'note' ? project.notes : project.checklistItems
  if (!items.some((item) => item.id === id)) throw new Error(`This ${kind === 'note' ? 'note' : 'task'} no longer exists.`)
  const detach = <T extends { attachedTo?: Attachment }>(item: T): T => item.attachedTo?.entityType === kind && item.attachedTo.id === id ? { ...item, attachedTo: undefined } : item
  return changed(project, {
    notes: project.notes.filter((item) => kind !== 'note' || item.id !== id).map(detach),
    checklistItems: project.checklistItems.filter((item) => kind !== 'checklistItem' || item.id !== id).map(detach),
  })
}

export const deleteNote = (project: Project, id: string): Project => deleteEntry(project, 'note', id)
export const deleteChecklistItem = (project: Project, id: string): Project => deleteEntry(project, 'checklistItem', id)
