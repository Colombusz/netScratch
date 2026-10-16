import { z } from 'zod'
import { migrateProject } from './migrations'
import { getAttachmentTargets, attachmentKey } from './notes'
import { validateSubnets } from './planning'
import type { Project, Note, ChecklistItem } from './schema'

export function documentError(cause: unknown): string {
  if (cause instanceof z.ZodError) return cause.issues.map((issue) => `${issue.path.join('.') || 'Project'}: ${issue.message}`).join('\n')
  return cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string' ? cause.message : 'Could not read this project.'
}

export function referenceIssues(project: Project): string[] {
  const issues: string[] = []
  const spaces = new Set(project.addressSpaces.map((item) => item.id))
  const vlans = new Set(project.vlans.map((item) => item.id))
  const devices = new Set(project.devices.map((item) => item.id))
  const hardware = new Set(project.hardwareItems.map((item) => item.id))
  const ports = new Map(project.ports.map((item) => [item.id, item]))
  const check = (id: string | null, exists: boolean, label: string) => { if (id !== null && !exists) issues.push(`${label} references missing item ${id}.`) }
  for (const subnet of project.subnets) {
    check(subnet.addressSpaceId, spaces.has(subnet.addressSpaceId), `Subnet ${subnet.name}`)
    check(subnet.vlanId, vlans.has(subnet.vlanId ?? ''), `Subnet ${subnet.name} VLAN`)
  }
  for (const device of project.devices) check(device.hardwareItemId, hardware.has(device.hardwareItemId ?? ''), `Device ${device.name} hardware`)
  for (const port of project.ports) {
    check(port.deviceId, devices.has(port.deviceId), `Port ${port.name} device`)
    check(port.accessVlanId, vlans.has(port.accessVlanId ?? ''), `Port ${port.name} access VLAN`)
    for (const id of port.trunkVlanIds) check(id, vlans.has(id), `Port ${port.name} trunk VLAN`)
  }
  for (const iface of project.interfaces) {
    check(iface.deviceId, devices.has(iface.deviceId), `Interface ${iface.name} device`)
    check(iface.vlanId, vlans.has(iface.vlanId ?? ''), `Interface ${iface.name} VLAN`)
    check(iface.portId, ports.has(iface.portId ?? ''), `Interface ${iface.name} port`)
    if (iface.portId && ports.has(iface.portId) && ports.get(iface.portId)!.deviceId !== iface.deviceId) issues.push(`Interface ${iface.name} references a port on another device.`)
  }
  for (const cable of project.links) {
    check(cable.sourcePortId, ports.has(cable.sourcePortId), `Cable ${cable.label || cable.id} end A`)
    check(cable.targetPortId, ports.has(cable.targetPortId), `Cable ${cable.label || cable.id} end B`)
  }
  for (const allocation of project.allocations) {
    check(allocation.hardwareItemId, hardware.has(allocation.hardwareItemId), `Allocation ${allocation.id} hardware`)
    check(allocation.deviceId, devices.has(allocation.deviceId ?? ''), `Allocation ${allocation.id} device`)
  }
  const targets = new Set(getAttachmentTargets(project).map((target) => attachmentKey(target.attachment)))
  const writing = new Map<string, Note | ChecklistItem>([...project.notes.map((item) => [`note:${item.id}`, item] as const), ...project.checklistItems.map((item) => [`checklistItem:${item.id}`, item] as const)])
  for (const [key, item] of writing) {
    if (item.attachedTo && !targets.has(attachmentKey(item.attachedTo))) issues.push(`${key} references a missing attachment.`)
    const visited = new Set<string>([key])
    let next = item.attachedTo
    while (next && ['note', 'checklistItem'].includes(next.entityType)) {
      const nextKey = attachmentKey(next)
      if (visited.has(nextKey)) { issues.push(`${key} has a circular attachment.`); break }
      visited.add(nextKey)
      next = writing.get(nextKey)?.attachedTo
    }
  }
  return issues
}

export function parseProjectJson(text: string): Project {
  let input: unknown
  try { input = JSON.parse(text) } catch { throw new Error('This is not valid JSON. Check the file or correct the JSON text.') }
  const project = migrateProject(input)
  const issues = [...referenceIssues(project), ...validateSubnets(project.addressSpaces, project.subnets)]
  if (issues.length) throw new Error(issues.join('\n'))
  return project
}

export function serializeProject(project: Project): string {
  return JSON.stringify(migrateProject(project), null, 2)
}

export function projectFilename(name: string, extension: string): string {
  const base = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 100)
  return `${base || 'netscratch-project'}.${extension}`
}
