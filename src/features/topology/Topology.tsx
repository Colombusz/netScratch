import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { ReactFlow, ReactFlowProvider, ConnectionMode, applyNodeChanges, useReactFlow, type Connection, type NodeChange, type Edge } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { deviceSchema, type Device } from '../../core/schema'
import { connectionError } from '../../core/topology'
import { useProjectStore } from '../../state/projectStore'
import { useTopologyUiStore } from '../../state/topologyUiStore'
import { DeviceNode, SiteNode } from './DeviceNode'
import { physicalEdges, physicalNodes, siteArrangement, type PhysicalNode } from './graph'
import { errorMessage, roles, titleCase } from './forms'
import { TopologyInspector } from './Inspector'
import '@xyflow/react/dist/style.css'
import './topology.css'

const nodeTypes = { device: DeviceNode, site: SiteNode }
const defaultEdgeOptions = { style: { stroke: 'var(--accent)', strokeWidth: 2 }, focusable: true }
const dragMime = 'application/x-netscratch-device'

function TopologyWorkspace() {
  const { devices, ports, links, positions } = useProjectStore(useShallow((state) => ({ devices: state.project.devices, ports: state.project.ports, links: state.project.links, positions: state.project.layout.physical })))
  const move = useProjectStore((state) => state.moveDevices)
  const add = useProjectStore((state) => state.addDevice)
  const saveCable = useProjectStore((state) => state.saveCable)
  const select = useTopologyUiStore((state) => state.select)
  const selection = useTopologyUiStore((state) => state.selection)
  const [grouped, setGrouped] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [nodes, setNodes] = useState<PhysicalNode[]>(() => physicalNodes(devices, ports, positions, grouped, [], links))
  const flow = useReactFlow<PhysicalNode, Edge>()
  const canvas = useRef<HTMLDivElement>(null)
  const edges = useMemo(() => physicalEdges(links, ports).map((edge) => ({ ...edge, selected: selection?.kind === 'link' && selection.id === edge.id })), [links, ports, selection])
  const names = useMemo(() => new Map(devices.map((device) => [device.id, device.name])), [devices])
  const portNames = useMemo(() => new Map(ports.map((port) => [port.id, `${names.get(port.deviceId)} / ${port.name}`])), [ports, names])

  useEffect(() => {
    setNodes((current) => physicalNodes(devices, ports, positions, grouped, current, links))
  }, [devices, ports, positions, grouped, links])

  const onNodesChange = useCallback((changes: NodeChange<PhysicalNode>[]) => {
    setNodes((current) => applyNodeChanges(changes.filter((change) => change.type !== 'remove'), current))
    const moved = changes.flatMap((change) => change.type === 'position' && change.position && !change.dragging && !change.id.startsWith('site:') ? [{ id: change.id, position: change.position }] : [])
    if (moved.length) move(moved)
  }, [move])

  const connect = useCallback((connection: Connection) => {
    try {
      if (!connection.sourceHandle || !connection.targetHandle) throw new Error('Connect a named port at each end.')
      const id = saveCable({ sourcePortId: connection.sourceHandle, targetPortId: connection.targetHandle, cableType: 'Cat6', label: '' })
      select({ kind: 'link', id }); setError(''); setFeedback('Cable created. Edit its type and label in the inspector.')
    } catch (cause) { setError(errorMessage(cause)) }
  }, [saveCable, select])

  const validConnection = useCallback((connection: Connection | Edge) => Boolean(connection.sourceHandle && connection.targetHandle && !connectionError(useProjectStore.getState().project, connection.sourceHandle, connection.targetHandle)), [])

  function addRole(role: Device['role'], point?: { x: number; y: number }) {
    const bounds = canvas.current?.getBoundingClientRect()
    const center = bounds ? flow.screenToFlowPosition({ x: bounds.left + bounds.width / 2 - 130, y: bounds.top + 90 }) : { x: 40, y: 60 }
    const offset = devices.length % 5 * 28
    const position = point ?? { x: center.x + offset, y: center.y + offset }
    const base = titleCase(role)
    let suffix = 1
    while (devices.some((device) => device.name === `${base} ${suffix}`)) suffix++
    const id = add({ name: `${base} ${suffix}`, role, scope: 'Main site' }, position)
    select({ kind: 'device', id }); setError(''); setFeedback(`${base} ${suffix} added. Add named ports in the inspector.`)
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const role = deviceSchema.shape.role.safeParse(event.dataTransfer.getData(dragMime))
    if (role.success) addRole(role.data, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  function inspectDevice(id: string) {
    if (!id) { select(null); return }
    select({ kind: 'device', id })
    void flow.fitView({ nodes: [{ id }], padding: .4, maxZoom: 1, duration: 0 })
  }

  return <div className="workspace-grid topology-grid">
    <div className="work-area topology-work-area">
      <header className="page-heading"><p className="section-index">Topology / Physical</p><h1>Physical topology</h1><p>Place devices, name their ports, and plan the cables between them.</p></header>
      <section className="device-palette" aria-label="Device palette"><div><h2>Add a device</h2><p className="help">Drag onto the canvas, or click to add.</p></div><div className="palette-buttons">{roles.map((role) => <button type="button" key={role} draggable onDragStart={(event) => { event.dataTransfer.setData(dragMime, role); event.dataTransfer.effectAllowed = 'move' }} onClick={() => addRole(role)}>{titleCase(role)}</button>)}</div></section>
      <div className="canvas-toolbar">
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void flow.fitView({ padding: .15, maxZoom: 1, duration: 0 })}>Fit view</button><button type="button" onClick={() => void flow.zoomIn()}>Zoom in</button><button type="button" onClick={() => void flow.zoomOut()}>Zoom out</button></div>
        <button type="button" onClick={() => { select({ kind: 'connect', id: '' }); setFeedback('') }}>New cable</button>
      </div>
      <div className="topology-canvas" ref={canvas} onDrop={drop} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} role="region" aria-label="Physical network canvas">
        <ReactFlow<PhysicalNode, Edge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onConnect={connect}
          isValidConnection={validConnection} connectionMode={ConnectionMode.Loose} defaultEdgeOptions={defaultEdgeOptions}
          onNodeClick={(_, node) => { if (node.type === 'device') select({ kind: 'device', id: node.id }) }}
          onEdgeClick={(_, edge) => select({ kind: 'link', id: edge.id })} onPaneClick={() => select(null)}
          onConnectEnd={(_, state) => { if (state.toHandle && !state.isValid) setError('Connection rejected. Choose two different free ports; each physical port allows one cable.') }}
          onlyRenderVisibleElements deleteKeyCode={null} minZoom={.1} maxZoom={2}
          onInit={(instance) => { if (devices.length) void instance.fitView({ padding: .15, maxZoom: 1, duration: 0 }) }}
          nodesDraggable nodesConnectable elementsSelectable snapToGrid snapGrid={[10, 10]}>
          {!devices.length && <div className="canvas-empty"><strong>No devices yet</strong><p>Add a router, switch, or endpoint from the palette to begin.</p></div>}
        </ReactFlow>
      </div>
      <div className="canvas-footer"><span>{devices.length} devices · {ports.length} ports · {links.length} cables</span><span>Drag device headers to move. Drag the canvas to pan.</span></div>
      {error && <p role="alert" className="error mt-3">{error}</p>}
      {feedback && <p role="status" className="notice mt-3">{feedback}</p>}
      <section className="panel topology-tools mt-5" aria-labelledby="topology-tools-title">
        <h2 id="topology-tools-title">Find &amp; arrange</h2>
        <div className="find-fields mt-4"><div className="field"><label htmlFor="find-device">Inspect device</label><select id="find-device" value={selection?.kind === 'device' ? selection.id : ''} onChange={(event) => inspectDevice(event.target.value)}><option value="">Choose a device</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} ({device.scope})</option>)}</select></div>
          <div className="field"><label htmlFor="find-cable">Inspect cable</label><select id="find-cable" value={selection?.kind === 'link' ? selection.id : ''} onChange={(event) => select(event.target.value ? { kind: 'link', id: event.target.value } : null)}><option value="">Choose a cable</option>{links.map((link) => <option key={link.id} value={link.id}>{portNames.get(link.sourcePortId)} ↔ {portNames.get(link.targetPortId)}{link.label ? ` (${link.label})` : ''}</option>)}</select></div></div>
        <div className="flex flex-wrap items-center gap-4"><label className="checkbox-label"><input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} />Show site outlines</label>
          {devices.length > 0 && <button type="button" onClick={() => {
            if (!window.confirm('Arrange all devices by site? This replaces their physical canvas positions.')) return
            move(siteArrangement(devices, ports)); setFeedback('Device positions arranged by site. Use Fit view to see the whole network.')
          }}>Arrange by site</button>}</div>
        <p className="help mt-3">Site outlines follow the device routing scope. Placement is stored in the project; zoom, selection, and outline visibility are view settings.</p>
      </section>
    </div>
    <TopologyInspector />
  </div>
}

export function Topology() {
  return <ReactFlowProvider><TopologyWorkspace /></ReactFlowProvider>
}
