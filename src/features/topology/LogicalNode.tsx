import { memo, useEffect } from 'react'
import { Handle, Position, useUpdateNodeInternals, type Node } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { useProjectStore } from '../../state/projectStore'
import { useTopologyUiStore } from '../../state/topologyUiStore'

type VlanNodeProps = Node<{ vlanId: string; memberCount: number }, 'vlan'>
type SubnetNodeProps = Node<{ subnetId: string; vlanId: string | null }, 'subnet'>
type InterfaceNodeProps = Node<{ interfaceId: string; deviceId: string }, 'interface'>

export const VlanNode = memo(function VlanNode({ id, data, selected, style }: VlanNodeProps) {
  const vlan = useProjectStore((state) => state.project.vlans.find((v) => v.id === data.vlanId))
  const interfaces = useProjectStore(useShallow((state) => state.project.interfaces.filter((i) => i.vlanId === data.vlanId)))
  const select = useTopologyUiStore((state) => state.select)
  const updateNodeInternals = useUpdateNodeInternals()
  const handleSignature = interfaces.map((i) => i.id).join(',')
  useEffect(() => { updateNodeInternals(id) }, [id, handleSignature, updateNodeInternals])
  if (!vlan) return null

  return <div className={`logical-vlan${selected ? ' is-selected' : ''}`} style={style}>
    <div className="vlan-drag" title="Drag to move this VLAN">
      <strong>VLAN {vlan.number}</strong>
      <span>{vlan.name}</span>
      <span className="vlan-count">{data.memberCount} interface{data.memberCount !== 1 ? 's' : ''}</span>
    </div>
    {interfaces.map((iface, index) => (
      <Handle key={iface.id} id={`iface:${data.vlanId}:${index}`} type="target" position={Position.Right}
        role="button" tabIndex={0} aria-label={`Connect ${vlan.name} interface ${index + 1}`}
        onClick={(e) => { e.stopPropagation(); select({ kind: 'interface', id: iface.id }) }}
        isConnectable={false} />
    ))}
    {data.vlanId && interfaces.length === 0 && <div className="vlan-empty">No interfaces in this VLAN</div>}
  </div>
})

export const SubnetNode = memo(function SubnetNode({ data, selected, style }: SubnetNodeProps) {
  const subnet = useProjectStore((state) => state.project.subnets.find((s) => s.id === data.subnetId))
  const vlan = subnet?.vlanId ? useProjectStore((state) => state.project.vlans.find((v) => v.id === subnet.vlanId)) : null
  if (!subnet) return null

  const color = vlan ? `hsl(${(vlan.number * 137) % 360}, 55%, 45%)` : 'var(--accent)'

  return <div className={`logical-subnet${selected ? ' is-selected' : ''}`} style={{ ...style, borderColor: color }}>
    <div className="subnet-drag" title="Drag to move this subnet">
      <strong>{subnet.name}</strong>
      <span className="address">{subnet.cidr}</span>
      {subnet.gatewayIp && <span className="address">GW: {subnet.gatewayIp}</span>}
    </div>
    <Handle id={`vlan:${data.vlanId ?? 'none'}`} type="target" position={Position.Top}
      isConnectable={false} />
    <Handle id={`gateway:${data.subnetId}`} type="source" position={Position.Right}
      role="button" tabIndex={0} aria-label={`Gateway ${subnet.gatewayIp ?? 'none'}`}
      isConnectable={false} />
  </div>
})

export const InterfaceNode = memo(function InterfaceNode({ data, selected, style }: InterfaceNodeProps) {
  const iface = useProjectStore((state) => state.project.interfaces.find((i) => i.id === data.interfaceId))
  const device = iface ? useProjectStore((state) => state.project.devices.find((d) => d.id === iface.deviceId)) : null
  const port = iface?.portId ? useProjectStore((state) => state.project.ports.find((p) => p.id === iface.portId)) : null
  if (!iface) return null

  const kindColors: Record<string, string> = {
    physical: 'var(--accent)',
    subinterface: '#6366f1',
    SVI: '#f59e0b',
    loopback: '#ec4899',
  }
  const kindColor = kindColors[iface.kind] ?? 'var(--accent)'

  return <div className={`logical-interface${selected ? ' is-selected' : ''}`} style={style}>
    <div className="iface-drag" title="Drag to move this interface">
      <span className="iface-kind" style={{ background: kindColor }}>{iface.kind}</span>
      <strong>{iface.name}</strong>
      {device && <span>{device.name}</span>}
      {port && <span className="address">{port.name}</span>}
      {iface.address && <span className="address">{iface.address}</span>}
      {iface.vlanId && <span className="iface-vlan">VLAN</span>}
    </div>
    <Handle id={`subnet:${iface.vlanId ?? 'none'}`} type="target" position={Position.Left}
      isConnectable={false} />
    <Handle id={`device:${data.deviceId}`} type="target" position={Position.Right}
      isConnectable={false} />
  </div>
})