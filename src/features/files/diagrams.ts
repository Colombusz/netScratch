import type { Project } from '../../core/schema'
import { physicalNodes, physicalEdges } from '../topology/graph'
import { logicalNodes, logicalEdges } from '../topology/logicalGraph'

type Label = { text: string; y: number; strong?: boolean }
type DiagramNode = { id: string; x: number; y: number; width: number; height: number; labels: Label[] }
type DiagramEdge = { id: string; x1: number; y1: number; x2: number; y2: number; label: string }
export type Diagram = { nodes: DiagramNode[]; edges: DiagramEdge[]; bounds: { x: number; y: number; width: number; height: number } }

export function edgeAnnotation(edge: DiagramEdge) {
  const gap = Math.abs(edge.x2 - edge.x1)
  const width = Math.max(64, Math.min(160, gap - 16))
  const maxChars = Math.max(5, Math.floor((width - 12) / 7))
  const words = edge.label.trim().split(/\s+/).flatMap((word) => word.match(new RegExp(`.{1,${maxChars}}`, 'gu')) ?? [])
  const lines: string[] = []
  for (const word of words) {
    const last = lines.at(-1)
    if (last && last.length + word.length + 1 <= maxChars) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  if (lines.length > 3) { lines.splice(3); lines[2] = `${lines[2]!.slice(0, -1)}…` }
  const height = lines.length * 14 + 8
  const center = gap < 80 ? Math.max(edge.x1, edge.x2) + 16 + width / 2 : (edge.x1 + edge.x2) / 2
  return { x: center - width / 2, y: (edge.y1 + edge.y2) / 2 - height / 2, width, height, lines }
}

export function buildDiagram(project: Project, kind: 'physical' | 'logical'): Diagram {
  const flowNodes = kind === 'physical'
    ? physicalNodes(project.devices, project.ports, project.layout.physical, false, [], project.links)
    : logicalNodes(project.vlans, project.subnets, project.interfaces, project.layout.logical)
  const flowEdges = kind === 'physical'
    ? physicalEdges(project.links, project.ports)
    : logicalEdges(project.vlans, project.subnets, project.interfaces, project.devices, project.ports)
  const nodes: DiagramNode[] = flowNodes.flatMap((node) => {
    let labels: Label[] = []
    if (node.type === 'device') {
      const device = project.devices.find((item) => item.id === node.id)!
      labels = [{ text: device.name, y: 24, strong: true }, { text: `${device.role} / ${device.scope}`, y: 47 },
        ...project.ports.filter((port) => port.deviceId === device.id).map((port, index) => ({ text: `${port.name} / ${port.speed}`, y: 90 + index * 44 }))]
    } else if (node.type === 'vlan') {
      const vlan = project.vlans.find((item) => item.id === node.data.vlanId)!
      labels = [{ text: `VLAN ${vlan.number}`, y: 24, strong: true }, { text: vlan.name, y: 47 }]
    } else if (node.type === 'subnet') {
      const subnet = project.subnets.find((item) => item.id === node.data.subnetId)!
      labels = [{ text: subnet.name, y: 24, strong: true }, { text: subnet.cidr, y: 47 }, { text: `Gateway: ${subnet.gatewayIp ?? 'None'}`, y: 70 }]
    } else if (node.type === 'interface') {
      const iface = project.interfaces.find((item) => item.id === node.data.interfaceId)!
      const device = project.devices.find((item) => item.id === iface.deviceId)
      labels = [{ text: iface.name, y: 24, strong: true }, { text: iface.kind, y: 47 }, { text: device?.name ?? 'Missing device', y: 70 }, { text: iface.address ?? 'Unnumbered', y: 93 }]
    } else return []
    return [{ id: node.id, x: node.position.x, y: node.position.y, width: node.width ?? 240, height: node.height ?? 160, labels }]
  })
  const byId = new Map(flowNodes.map((node) => [node.id, node]))
  const edges: DiagramEdge[] = flowEdges.flatMap((edge) => {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    const a = source?.handles?.find((handle) => handle.id === edge.sourceHandle)
    const b = target?.handles?.find((handle) => handle.id === edge.targetHandle)
    if (!source || !target || !a || !b) return []
    return [{ id: edge.id, x1: source.position.x + a.x + (a.width ?? 0) / 2, y1: source.position.y + a.y + (a.height ?? 0) / 2,
      x2: target.position.x + b.x + (b.width ?? 0) / 2, y2: target.position.y + b.y + (b.height ?? 0) / 2, label: typeof edge.label === 'string' ? edge.label : '' }]
  })
  if (!nodes.length) return { nodes, edges, bounds: { x: 0, y: 0, width: 640, height: 180 } }
  const x = Math.min(...nodes.map((node) => node.x)) - 30
  const y = Math.min(...nodes.map((node) => node.y)) - 30
  const annotations = edges.filter((edge) => edge.label).map(edgeAnnotation)
  return { nodes, edges, bounds: { x, y, width: Math.max(...nodes.map((node) => node.x + node.width), ...annotations.map((label) => label.x + label.width)) - x + 30, height: Math.max(...nodes.map((node) => node.y + node.height), ...annotations.map((label) => label.y + label.height)) - y + 30 } }
}
