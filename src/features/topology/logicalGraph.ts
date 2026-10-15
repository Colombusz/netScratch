import { Position, type Edge, type Node, type NodeHandle } from '@xyflow/react'
import type { Vlan, Interface, Subnet, Device, Port, Project } from '../../core/schema'

export const LOGICAL_NODE_WIDTH = 220
export const LOGICAL_VLAN_HEIGHT = 90
export const LOGICAL_SUBNET_HEIGHT = 80
export const LOGICAL_INTERFACE_HEIGHT = 50

export type VlanFlowNode = Node<{ vlanId: string; memberCount: number }, 'vlan'>
export type SubnetFlowNode = Node<{ subnetId: string; vlanId: string | null }, 'subnet'>
export type InterfaceFlowNode = Node<{ interfaceId: string; deviceId: string }, 'interface'>
export type LogicalNode = VlanFlowNode | SubnetFlowNode | InterfaceFlowNode

function vlanColor(number: number): string {
  const hue = (number * 137) % 360
  return `hsl(${hue}, 55%, 45%)`
}

function vlanColorLight(number: number): string {
  const hue = (number * 137) % 360
  return `hsl(${hue}, 55%, 88%)`
}

function vlanColorDark(number: number): string {
  const hue = (number * 137) % 360
  return `hsl(${hue}, 55%, 30%)`
}

export function logicalNodes(
  vlans: Vlan[],
  subnets: Subnet[],
  interfaces: Interface[],
  positions: Project['layout']['logical'],
  previous: LogicalNode[] = []
): LogicalNode[] {
  const old = new Map(previous.map((node) => [node.id, node]))
  const subnetByVlan = new Map<string, Subnet>()
  for (const subnet of subnets) {
    if (subnet.vlanId) subnetByVlan.set(subnet.vlanId, subnet)
  }
  const interfacesByVlan = new Map<string, Interface[]>()
  for (const iface of interfaces) {
    if (iface.vlanId) {
      const list = interfacesByVlan.get(iface.vlanId) ?? []
      list.push(iface)
      interfacesByVlan.set(iface.vlanId, list)
    }
  }
  const nodes: LogicalNode[] = []
  let y = 60
  for (const vlan of vlans) {
    const position = positions[`vlan:${vlan.id}`] ?? { x: 60, y }
    const memberCount = (interfacesByVlan.get(vlan.id) ?? []).length
    const color = vlanColor(vlan.number)
    const colorLight = vlanColorLight(vlan.number)
    const colorDark = vlanColorDark(vlan.number)
    const handles: NodeHandle[] = []
    const subnet = subnetByVlan.get(vlan.id)
    if (subnet) {
      handles.push({ id: `subnet:${subnet.id}`, type: 'target', position: Position.Bottom, x: LOGICAL_NODE_WIDTH / 2 - 12, y: LOGICAL_VLAN_HEIGHT - 10, width: 24, height: 24 })
    }
    for (let i = 0; i < memberCount; i++) {
      handles.push({ id: `iface:${vlan.id}:${i}`, type: 'target', position: Position.Right, x: LOGICAL_NODE_WIDTH - 15, y: 40 + i * 28, width: 30, height: 30 })
    }
    const existing = old.get(`vlan:${vlan.id}`)
    nodes.push({
      ...existing,
      id: `vlan:${vlan.id}`,
      type: 'vlan',
      position,
      data: { vlanId: vlan.id, memberCount },
      handles,
      width: LOGICAL_NODE_WIDTH,
      height: LOGICAL_VLAN_HEIGHT,
      style: { background: colorLight, border: `2px solid ${color}`, borderRadius: 8 },
      dragHandle: '.vlan-drag',
      zIndex: 1,
    } as VlanFlowNode)
    if (subnet) {
      const subnetPosition = positions[`subnet:${subnet.id}`] ?? { x: position.x + LOGICAL_NODE_WIDTH + 80, y: position.y }
      const subnetHandles: NodeHandle[] = [
        { id: `vlan:${vlan.id}`, type: 'source', position: Position.Top, x: LOGICAL_NODE_WIDTH / 2 - 12, y: -10, width: 24, height: 24 },
        { id: `gateway:${subnet.id}`, type: 'source', position: Position.Right, x: LOGICAL_NODE_WIDTH - 10, y: LOGICAL_SUBNET_HEIGHT / 2 - 12, width: 24, height: 24 },
      ]
      const subnetExisting = old.get(`subnet:${subnet.id}`)
      nodes.push({
        ...subnetExisting,
        id: `subnet:${subnet.id}`,
        type: 'subnet',
        position: subnetPosition,
        data: { subnetId: subnet.id, vlanId: vlan.id },
        handles: subnetHandles,
        width: LOGICAL_NODE_WIDTH,
        height: LOGICAL_SUBNET_HEIGHT,
        style: { background: 'var(--surface)', border: `2px solid ${color}`, borderRadius: 8 },
        dragHandle: '.subnet-drag',
        zIndex: 1,
      } as SubnetFlowNode)
      const ifaces = interfacesByVlan.get(vlan.id) ?? []
      for (let i = 0; i < ifaces.length; i++) {
        const iface = ifaces[i]!
        const ifacePosition = positions[`iface:${iface.id}`] ?? { x: subnetPosition.x + LOGICAL_NODE_WIDTH + 80, y: position.y + i * 70 }
        const ifaceHandles: NodeHandle[] = [
          { id: `subnet:${subnet.id}`, type: 'target', position: Position.Left, x: -15, y: LOGICAL_INTERFACE_HEIGHT / 2 - 12, width: 30, height: 30 },
          { id: `device:${iface.deviceId}`, type: 'target', position: Position.Right, x: LOGICAL_NODE_WIDTH - 15, y: LOGICAL_INTERFACE_HEIGHT / 2 - 12, width: 30, height: 30 },
        ]
        const ifaceExisting = old.get(`iface:${iface.id}`)
        nodes.push({
          ...ifaceExisting,
          id: `iface:${iface.id}`,
          type: 'interface',
          position: ifacePosition,
          data: { interfaceId: iface.id, deviceId: iface.deviceId },
          handles: ifaceHandles,
          width: LOGICAL_NODE_WIDTH,
          height: LOGICAL_INTERFACE_HEIGHT,
          style: { background: 'var(--surface)', border: `1px solid ${colorDark}`, borderRadius: 6 },
          dragHandle: '.iface-drag',
          zIndex: 1,
        } as InterfaceFlowNode)
      }
    }
    y += LOGICAL_VLAN_HEIGHT + 40
  }
  return nodes
}

export function logicalEdges(
  vlans: Vlan[],
  subnets: Subnet[],
  interfaces: Interface[],
  devices: Device[],
  ports: Port[]
): Edge[] {
  const edges: Edge[] = []
  const subnetByVlan = new Map<string, Subnet>()
  for (const subnet of subnets) {
    if (subnet.vlanId) subnetByVlan.set(subnet.vlanId, subnet)
  }
  const interfacesByVlan = new Map<string, Interface[]>()
  for (const iface of interfaces) {
    if (iface.vlanId) {
      const list = interfacesByVlan.get(iface.vlanId) ?? []
      list.push(iface)
      interfacesByVlan.set(iface.vlanId, list)
    }
  }
  const portById = new Map(ports.map((p) => [p.id, p]))
  for (const vlan of vlans) {
    const subnet = subnetByVlan.get(vlan.id)
    if (subnet) {
      edges.push({
        id: `vlan-subnet:${vlan.id}`,
        source: `vlan:${vlan.id}`,
        target: `subnet:${subnet.id}`,
        sourceHandle: `subnet:${subnet.id}`,
        targetHandle: `vlan:${vlan.id}`,
        type: 'smoothstep',
        style: { stroke: vlanColor(vlan.number), strokeWidth: 2, strokeDasharray: '6 4' },
        animated: true,
        zIndex: 2,
      })
      if (subnet.gatewayIp) {
        edges.push({
          id: `subnet-gateway:${subnet.id}`,
          source: `subnet:${subnet.id}`,
          target: `subnet:${subnet.id}`,
          sourceHandle: `gateway:${subnet.id}`,
          targetHandle: `gateway:${subnet.id}`,
          type: 'smoothstep',
          label: `GW: ${subnet.gatewayIp}`,
          labelStyle: { fill: 'var(--text)', fontSize: 11 },
          labelBgStyle: { fill: 'var(--surface)', stroke: vlanColor(vlan.number) },
          labelBgPadding: [4, 4] as [number, number],
          style: { stroke: vlanColor(vlan.number), strokeWidth: 1 },
          zIndex: 2,
        })
      }
      const ifaces = interfacesByVlan.get(vlan.id) ?? []
      for (let i = 0; i < ifaces.length; i++) {
        const iface = ifaces[i]!
        const device = devices.find((d) => d.id === iface.deviceId)
        const port = iface.portId ? portById.get(iface.portId) : undefined
        edges.push({
          id: `subnet-iface:${iface.id}`,
          source: `subnet:${subnet.id}`,
          target: `iface:${iface.id}`,
          sourceHandle: `iface:${vlan.id}:${i}`,
          targetHandle: `subnet:${subnet.id}`,
          type: 'smoothstep',
          style: { stroke: vlanColor(vlan.number), strokeWidth: 2 },
          label: port ? `${device?.name ?? 'Device'} / ${port.name}` : device?.name,
          labelStyle: { fill: 'var(--text)', fontSize: 11 },
          labelBgStyle: { fill: 'var(--surface)', stroke: vlanColor(vlan.number) },
          labelBgPadding: [4, 4] as [number, number],
          zIndex: 2,
        })
        if (device) {
          edges.push({
            id: `iface-device:${iface.id}`,
            source: `iface:${iface.id}`,
            target: `iface:${iface.id}`,
            sourceHandle: `device:${iface.deviceId}`,
            targetHandle: `device:${iface.deviceId}`,
            type: 'smoothstep',
            style: { stroke: 'var(--muted)', strokeWidth: 1, strokeDasharray: '4 4' },
            label: device.name,
            labelStyle: { fill: 'var(--muted)', fontSize: 10 },
            zIndex: 1,
          })
        }
      }
    } else {
      const ifaces = interfacesByVlan.get(vlan.id) ?? []
      for (let i = 0; i < ifaces.length; i++) {
        const iface = ifaces[i]!
        const device = devices.find((d) => d.id === iface.deviceId)
        const port = iface.portId ? portById.get(iface.portId) : undefined
        edges.push({
          id: `vlan-iface:${iface.id}`,
          source: `vlan:${vlan.id}`,
          target: `iface:${iface.id}`,
          sourceHandle: `iface:${vlan.id}:${i}`,
          targetHandle: `subnet:${vlan.id}`,
          type: 'smoothstep',
          style: { stroke: vlanColor(vlan.number), strokeWidth: 2 },
          label: port ? `${device?.name ?? 'Device'} / ${port.name}` : device?.name,
          labelStyle: { fill: 'var(--text)', fontSize: 11 },
          labelBgStyle: { fill: 'var(--surface)', stroke: vlanColor(vlan.number) },
          labelBgPadding: [4, 4] as [number, number],
          zIndex: 2,
        })
        if (device) {
          edges.push({
            id: `iface-device:${iface.id}`,
            source: `iface:${iface.id}`,
            target: `iface:${iface.id}`,
            sourceHandle: `device:${iface.deviceId}`,
            targetHandle: `device:${iface.deviceId}`,
            type: 'smoothstep',
            style: { stroke: 'var(--muted)', strokeWidth: 1, strokeDasharray: '4 4' },
            label: device.name,
            labelStyle: { fill: 'var(--muted)', fontSize: 10 },
            zIndex: 1,
          })
        }
      }
    }
  }
  return edges
}