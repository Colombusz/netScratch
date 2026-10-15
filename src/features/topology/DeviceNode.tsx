import { memo, useEffect } from 'react'
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { useProjectStore } from '../../state/projectStore'
import { useTopologyUiStore } from '../../state/topologyUiStore'
import type { DeviceFlowNode, SiteFlowNode } from './graph'

export const DeviceNode = memo(function DeviceNode({ id, data, selected }: NodeProps<DeviceFlowNode>) {
  const device = useProjectStore((state) => state.project.devices.find((item) => item.id === id))
  const ports = useProjectStore(useShallow((state) => state.project.ports.filter((port) => port.deviceId === id)))
  const occupied = useProjectStore(useShallow((state) => {
    const ids = new Set(ports.map((port) => port.id))
    return state.project.links.flatMap((link) => [link.sourcePortId, link.targetPortId].filter((portId) => ids.has(portId)))
  }))
  const select = useTopologyUiStore((state) => state.select)
  const activePort = useTopologyUiStore((state) => state.selection?.kind === 'port' ? state.selection.id : null)
  const updateNodeInternals = useUpdateNodeInternals()
  const handleSignature = ports.map((port) => `${port.id}:${data.portSides[port.id]}`).join(',')
  useEffect(() => { updateNodeInternals(id) }, [id, handleSignature, updateNodeInternals])
  if (!device) return null

  return <div className={`physical-device${selected ? ' is-selected' : ''}`}>
    <div className="device-drag" title="Drag to move this device">
      <strong title={device.name}>{device.name}</strong><span>{device.role} · {device.scope}</span>
    </div>
    {!ports.length && <button type="button" className="nodrag empty-ports" onClick={(event) => { event.stopPropagation(); select({ kind: 'device', id }) }}>Add named ports</button>}
    {ports.map((port) => <div key={port.id} className={`device-port${occupied.includes(port.id) ? ' occupied' : ''}`}>
      <button type="button" className="nodrag port-row" aria-label={`Inspect ${device.name} port ${port.name}`} aria-pressed={activePort === port.id}
        onClick={(event) => { event.stopPropagation(); select({ kind: 'port', id: port.id }) }}>
        <span className="port-name address" title={port.name}>{port.name}</span>
        <span className="port-speed" title={`${port.speed}, ${port.media}, ${occupied.includes(port.id) ? 'connected' : 'free'}`}>{port.speed}<span>{occupied.includes(port.id) ? 'Connected' : port.media}</span></span>
      </button>
      <Handle id={port.id} type="source" position={data.portSides[port.id] ?? Position.Right} role="button" tabIndex={0}
        aria-label={`Cable handle for ${device.name} ${port.name}`} title={`${port.name}: drag to connect, or press Enter to inspect`}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); select({ kind: occupied.includes(port.id) ? 'port' : 'connect', id: port.id }) } }}
        isConnectable={!occupied.includes(port.id)} />
    </div>)}
  </div>
})

export const SiteNode = memo(function SiteNode({ data }: NodeProps<SiteFlowNode>) {
  return <div className="site-outline"><span>Site: {data.label}</span></div>
})
