import { Position, type Edge, type Node, type NodeHandle } from '@xyflow/react'
import type { Vlan, Interface, Subnet, Device, Port, Project } from '../../core/schema'

export const LOGICAL_NODE_WIDTH = 240
export const LOGICAL_VLAN_HEIGHT = 160
export const LOGICAL_SUBNET_HEIGHT = 180
export const LOGICAL_INTERFACE_HEIGHT = 220
export type VlanFlowNode = Node<{ vlanId: string; memberCount: number }, 'vlan'>
export type SubnetFlowNode = Node<{ subnetId: string; vlanId: string | null }, 'subnet'>
export type InterfaceFlowNode = Node<{ interfaceId: string; deviceId: string }, 'interface'>
export type LogicalNode = VlanFlowNode | SubnetFlowNode | InterfaceFlowNode

const vlanColor = (number: number) => `hsl(${(number * 137) % 360}, 55%, 45%)`
const dimensions = (height: number) => ({ width: LOGICAL_NODE_WIDTH, height, measured: { width: LOGICAL_NODE_WIDTH, height } })
const sourceHandle = (height: number): NodeHandle => ({ id: 'members', type: 'source', position: Position.Right, x: LOGICAL_NODE_WIDTH - 6, y: height / 2 - 6, width: 12, height: 12 })
const targetHandle = (height: number): NodeHandle => ({ id: 'membership', type: 'target', position: Position.Left, x: -6, y: height / 2 - 6, width: 12, height: 12 })

export function logicalNodes(vlans: Vlan[], subnets: Subnet[], interfaces: Interface[], positions: Project['layout']['logical'], previous: LogicalNode[] = []): LogicalNode[] {
  const old = new Map(previous.map((node) => [node.id, node]))
  const nodes: LogicalNode[] = []
  const placedSubnets = new Set<string>()
  const placedInterfaces = new Set<string>()
  let y = 60

  function addSubnet(subnet: Subnet, fallback: { x: number; y: number }) {
    const id = `subnet:${subnet.id}`
    nodes.push({ ...old.get(id), id, type: 'subnet', position: positions[id] ?? fallback,
      data: { subnetId: subnet.id, vlanId: subnet.vlanId }, ...dimensions(LOGICAL_SUBNET_HEIGHT),
      handles: [targetHandle(LOGICAL_SUBNET_HEIGHT), sourceHandle(LOGICAL_SUBNET_HEIGHT)], dragHandle: '.subnet-drag', ariaLabel: `Subnet ${subnet.name}, ${subnet.cidr}`,
    } as SubnetFlowNode)
    placedSubnets.add(subnet.id)
  }

  function addInterface(iface: Interface, fallback: { x: number; y: number }) {
    const id = `iface:${iface.id}`
    nodes.push({ ...old.get(id), id, type: 'interface', position: positions[id] ?? fallback,
      data: { interfaceId: iface.id, deviceId: iface.deviceId }, ...dimensions(LOGICAL_INTERFACE_HEIGHT),
      handles: [targetHandle(LOGICAL_INTERFACE_HEIGHT)], dragHandle: '.iface-drag', ariaLabel: `Interface ${iface.name}, ${iface.kind}`,
    } as InterfaceFlowNode)
    placedInterfaces.add(iface.id)
  }

  for (const vlan of vlans) {
    const id = `vlan:${vlan.id}`
    const members = interfaces.filter((iface) => iface.vlanId === vlan.id)
    const vlanSubnets = subnets.filter((subnet) => subnet.vlanId === vlan.id)
    const position = positions[id] ?? { x: 60, y }
    nodes.push({ ...old.get(id), id, type: 'vlan', position, data: { vlanId: vlan.id, memberCount: members.length },
      ...dimensions(LOGICAL_VLAN_HEIGHT), handles: [sourceHandle(LOGICAL_VLAN_HEIGHT)],
      style: { borderTop: `4px solid ${vlanColor(vlan.number)}` }, dragHandle: '.vlan-drag', ariaLabel: `VLAN ${vlan.number}, ${vlan.name}`,
    } as VlanFlowNode)
    vlanSubnets.forEach((subnet, index) => addSubnet(subnet, { x: 380, y: y + index * (LOGICAL_SUBNET_HEIGHT + 40) }))
    members.forEach((iface, index) => addInterface(iface, { x: vlanSubnets.length ? 700 : 380, y: y + index * (LOGICAL_INTERFACE_HEIGHT + 40) }))
    y += Math.max(LOGICAL_VLAN_HEIGHT, vlanSubnets.length * (LOGICAL_SUBNET_HEIGHT + 40), members.length * (LOGICAL_INTERFACE_HEIGHT + 40)) + 60
  }
  for (const subnet of subnets) if (!placedSubnets.has(subnet.id)) { addSubnet(subnet, { x: 60, y }); y += LOGICAL_SUBNET_HEIGHT + 60 }
  for (const iface of interfaces) if (!placedInterfaces.has(iface.id)) { addInterface(iface, { x: 60, y }); y += LOGICAL_INTERFACE_HEIGHT + 60 }
  return nodes
}

export function logicalEdges(vlans: Vlan[], subnets: Subnet[], interfaces: Interface[], devices: Device[], ports: Port[]): Edge[] {
  const edges: Edge[] = []
  function edge(id: string, source: string, target: string, label: string): Edge {
    return { id, source, target, sourceHandle: 'members', targetHandle: 'membership', type: 'smoothstep', label,
      style: { stroke: 'var(--accent)', strokeWidth: 2 }, labelStyle: { fill: 'var(--text)', fontSize: 12 },
      labelBgStyle: { fill: 'var(--surface)', stroke: 'var(--control)' }, labelBgPadding: [6, 4], ariaLabel: label, zIndex: 2 }
  }
  for (const vlan of vlans) {
    const vlanSubnets = subnets.filter((subnet) => subnet.vlanId === vlan.id)
    for (const subnet of vlanSubnets) edges.push(edge(`vlan-subnet:${subnet.id}`, `vlan:${vlan.id}`, `subnet:${subnet.id}`, `VLAN ${vlan.number}: ${subnet.name}`))
    for (const iface of interfaces.filter((item) => item.vlanId === vlan.id)) {
      const subnet = vlanSubnets[0]
      const device = devices.find((item) => item.id === iface.deviceId)
      const port = ports.find((item) => item.id === iface.portId)
      const source = subnet ? `subnet:${subnet.id}` : `vlan:${vlan.id}`
      edges.push(edge(`membership:${iface.id}`, source, `iface:${iface.id}`, `${device?.name ?? 'Missing device'} / ${port?.name ?? iface.name}`))
    }
  }
  return edges
}
