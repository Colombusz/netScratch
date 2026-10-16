import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useProjectStore } from '../../state/projectStore'
import { useTopologyUiStore } from '../../state/topologyUiStore'
import type { VlanFlowNode, SubnetFlowNode, InterfaceFlowNode } from './logicalGraph'

export const VlanNode = memo(function VlanNode({ data, selected }: NodeProps<VlanFlowNode>) {
  const vlan = useProjectStore((state) => state.project.vlans.find((item) => item.id === data.vlanId))
  const select = useTopologyUiStore((state) => state.select)
  if (!vlan) return null
  return <div className={`logical-node logical-vlan${selected ? ' is-selected' : ''}`}>
    <div className="vlan-drag logical-drag"><strong>VLAN {vlan.number}</strong><span title={vlan.name}>{vlan.name}</span><span>{data.memberCount} interfaces</span></div>
    <button type="button" className="nodrag" onClick={(event) => { event.stopPropagation(); select({ kind: 'vlan', id: vlan.id }) }}>Inspect VLAN {vlan.number}</button>
    <Handle id="members" type="source" position={Position.Right} isConnectable={false} aria-hidden="true" tabIndex={-1} />
  </div>
})

export const SubnetNode = memo(function SubnetNode({ data, selected }: NodeProps<SubnetFlowNode>) {
  const subnet = useProjectStore((state) => state.project.subnets.find((item) => item.id === data.subnetId))
  const vlan = useProjectStore((state) => state.project.vlans.find((item) => item.id === subnet?.vlanId))
  const select = useTopologyUiStore((state) => state.select)
  if (!subnet) return null
  return <div className={`logical-node logical-subnet${selected ? ' is-selected' : ''}`}>
    <div className="subnet-drag logical-drag"><strong title={subnet.name}>{subnet.name}</strong><span className="address">{subnet.cidr}</span><span className="address">Gateway: {subnet.gatewayIp ?? 'None'}</span><span>{vlan ? `VLAN ${vlan.number}` : 'No VLAN'}</span></div>
    <button type="button" className="nodrag" onClick={(event) => { event.stopPropagation(); select({ kind: 'subnet', id: subnet.id }) }}>Inspect subnet</button>
    <Handle id="membership" type="target" position={Position.Left} isConnectable={false} aria-hidden="true" tabIndex={-1} />
    <Handle id="members" type="source" position={Position.Right} isConnectable={false} aria-hidden="true" tabIndex={-1} />
  </div>
})

export const InterfaceNode = memo(function InterfaceNode({ data, selected }: NodeProps<InterfaceFlowNode>) {
  const iface = useProjectStore((state) => state.project.interfaces.find((item) => item.id === data.interfaceId))
  const device = useProjectStore((state) => state.project.devices.find((item) => item.id === iface?.deviceId))
  const port = useProjectStore((state) => state.project.ports.find((item) => item.id === iface?.portId))
  const vlan = useProjectStore((state) => state.project.vlans.find((item) => item.id === iface?.vlanId))
  const select = useTopologyUiStore((state) => state.select)
  if (!iface) return null
  return <div className={`logical-node logical-interface${selected ? ' is-selected' : ''}`}>
    <div className="iface-drag logical-drag"><strong title={iface.name}>{iface.name}</strong><span>{iface.kind}</span><span title={device?.name}>{device?.name ?? 'Missing device'}</span><span>{port?.name ?? 'No physical port'}</span><span className="address">{iface.address ?? 'Unnumbered'}</span><span>{vlan ? `VLAN ${vlan.number}` : 'No VLAN'}</span></div>
    <button type="button" className="nodrag" onClick={(event) => { event.stopPropagation(); select({ kind: 'interface', id: iface.id }) }}>Inspect interface</button>
    <Handle id="membership" type="target" position={Position.Left} isConnectable={false} aria-hidden="true" tabIndex={-1} />
  </div>
})
