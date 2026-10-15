import { Position, type Edge, type Node, type NodeHandle } from '@xyflow/react'
import type { Device, Link, Port, Project } from '../../core/schema'

export const DEVICE_WIDTH = 260
export const deviceHeight = (portCount: number) => 66 + Math.max(1, portCount) * 44
export type DeviceFlowNode = Node<{ deviceId: string; portSides: Record<string, Position> }, 'device'>
export type SiteFlowNode = Node<{ label: string }, 'site'>
export type PhysicalNode = DeviceFlowNode | SiteFlowNode

export function physicalNodes(devices: Device[], ports: Port[], positions: Project['layout']['physical'], grouped: boolean, previous: PhysicalNode[] = [], links: Link[] = []): PhysicalNode[] {
  const counts = new Map<string, number>()
  const portsByDevice = new Map<string, Port[]>()
  const portById = new Map(ports.map((port) => [port.id, port]))
  const peer = new Map<string, string>()
  for (const link of links) { peer.set(link.sourcePortId, link.targetPortId); peer.set(link.targetPortId, link.sourcePortId) }
  for (const port of ports) {
    counts.set(port.deviceId, (counts.get(port.deviceId) ?? 0) + 1)
    const list = portsByDevice.get(port.deviceId) ?? []
    list.push(port)
    portsByDevice.set(port.deviceId, list)
  }
  const old = new Map(previous.map((node) => [node.id, node]))
  const nodes: PhysicalNode[] = devices.map((device, index) => {
    const position = positions[device.id] ?? { x: (index % 4) * 340, y: Math.floor(index / 4) * 260 }
    const height = deviceHeight(counts.get(device.id) ?? 0)
    const handles: NodeHandle[] = (portsByDevice.get(device.id) ?? []).map((port, row) => {
      const peerPort = portById.get(peer.get(port.id) ?? '')
      const other = peerPort ? positions[peerPort.deviceId] : undefined
      const side = other && other.x < position.x ? Position.Left : Position.Right
      return { id: port.id, type: 'source', position: side, x: side === Position.Right ? DEVICE_WIDTH - 23 : -21, y: 65 + row * 44, width: 44, height: 44 }
    })
    const existing = old.get(device.id)
    const sameHandles = existing?.handles?.length === handles.length && handles.every((handle, index) => existing?.handles?.[index]?.id === handle.id && existing.handles[index]?.position === handle.position)
    if (existing?.type === 'device' && sameHandles && existing.position.x === position.x && existing.position.y === position.y && existing.height === height && existing.ariaLabel === `${device.name}, ${device.role}`) return existing
    return { ...existing, id: device.id, type: 'device', position,
      data: existing?.type === 'device' && sameHandles ? existing.data : { deviceId: device.id, portSides: Object.fromEntries(handles.map((handle) => [handle.id!, handle.position])) },
      handles,
      width: DEVICE_WIDTH, height, dragHandle: '.device-drag', ariaLabel: `${device.name}, ${device.role}`, zIndex: 1 }
  })
  if (!grouped) return nodes
  const bounds = new Map<string, { left: number; top: number; right: number; bottom: number }>()
  devices.forEach((device, index) => {
    const position = nodes[index]!.position
    const box = { left: position.x - 24, top: position.y - 50, right: position.x + DEVICE_WIDTH + 24, bottom: position.y + deviceHeight(counts.get(device.id) ?? 0) + 24 }
    const current = bounds.get(device.scope)
    bounds.set(device.scope, current ? { left: Math.min(current.left, box.left), top: Math.min(current.top, box.top), right: Math.max(current.right, box.right), bottom: Math.max(current.bottom, box.bottom) } : box)
  })
  const groups: SiteFlowNode[] = [...bounds].map(([label, box]) => ({
    id: `site:${label}`, type: 'site', position: { x: box.left, y: box.top },
    data: { label }, width: box.right - box.left, height: box.bottom - box.top,
    style: { width: box.right - box.left, height: box.bottom - box.top },
    draggable: false, selectable: false, connectable: false, focusable: false, zIndex: -1,
  }))
  return [...groups, ...nodes]
}

export function physicalEdges(links: Link[], ports: Port[]): Edge[] {
  const portById = new Map(ports.map((port) => [port.id, port]))
  return links.flatMap((link) => {
    const source = portById.get(link.sourcePortId)
    const target = portById.get(link.targetPortId)
    if (!source || !target) return []
    return [{ id: link.id, source: source.deviceId, target: target.deviceId,
      sourceHandle: source.id, targetHandle: target.id, type: 'smoothstep',
      label: [link.cableType, link.label].filter(Boolean).join(' · '),
      ariaLabel: `${source.name} to ${target.name}: ${link.cableType}${link.label ? `, ${link.label}` : ''}`,
      interactionWidth: 28, zIndex: 2,
      labelStyle: { fill: 'var(--text)', fontSize: 12 },
      labelBgStyle: { fill: 'var(--surface)', stroke: 'var(--control)' }, labelBgPadding: [6, 4] as [number, number],
    }]
  })
}

export function siteArrangement(devices: Device[], ports: Port[]) {
  const counts = new Map<string, number>()
  ports.forEach((port) => counts.set(port.deviceId, (counts.get(port.deviceId) ?? 0) + 1))
  const scopes = [...new Set(devices.map((device) => device.scope))]
  const changes: { id: string; position: { x: number; y: number } }[] = []
  let top = 60
  for (const scope of scopes) {
    const members = devices.filter((device) => device.scope === scope)
    for (let start = 0; start < members.length; start += 3) {
      const row = members.slice(start, start + 3)
      row.forEach((device, column) => changes.push({ id: device.id, position: { x: 40 + column * 370, y: top } }))
      top += Math.max(...row.map((device) => deviceHeight(counts.get(device.id) ?? 0))) + 100
    }
    top += 60
  }
  return changes
}
