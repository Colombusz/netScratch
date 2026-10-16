import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider, ConnectionMode, applyNodeChanges, useReactFlow, type NodeChange, type Edge, type NodeTypes } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { useProjectStore } from '../../state/projectStore'
import { useTopologyUiStore, type TopologySelection } from '../../state/topologyUiStore'
import { VlanNode, SubnetNode, InterfaceNode } from './LogicalNode'
import { logicalEdges, logicalNodes, type LogicalNode } from './logicalGraph'
import { errorMessage } from './forms'
import { VlanCreator } from './VlanCreator'
import '@xyflow/react/dist/style.css'
import './topology.css'

const nodeTypes = { vlan: VlanNode, subnet: SubnetNode, interface: InterfaceNode } satisfies NodeTypes
const defaultEdgeOptions = { style: { stroke: 'var(--accent)', strokeWidth: 2 }, focusable: false }

function LogicalWorkspace() {
  const { vlans, subnets, interfaces, devices, ports, positions } = useProjectStore(useShallow((state) => ({
    vlans: state.project.vlans,
    subnets: state.project.subnets,
    interfaces: state.project.interfaces,
    devices: state.project.devices,
    ports: state.project.ports,
    positions: state.project.layout.logical,
  })))
  const select = useTopologyUiStore((state) => state.select)
  const move = useProjectStore((state) => state.moveLogicalNodes)
  const selection = useTopologyUiStore((state) => state.selection)
  const [feedback, setFeedback] = useState('')
  const [nodes, setNodes] = useState<LogicalNode[]>(() => logicalNodes(vlans, subnets, interfaces, positions))
  const flow = useReactFlow<LogicalNode, Edge>()
  const canvas = useRef<HTMLDivElement>(null)
  const edges = useMemo(() => logicalEdges(vlans, subnets, interfaces, devices, ports), [vlans, subnets, interfaces, devices, ports])

  useEffect(() => {
    setNodes((current) => logicalNodes(vlans, subnets, interfaces, positions, current))
  }, [vlans, subnets, interfaces, devices, positions])

  const onNodesChange = useCallback((changes: NodeChange<LogicalNode>[]) => {
    setNodes((current) => applyNodeChanges(changes.filter((change) => change.type !== 'remove'), current))
    const moved = changes.flatMap((change) => change.type === 'position' && change.position && !change.dragging ? [[change.id, change.position]] : [])
    if (moved.length) move(Object.fromEntries(moved))
  }, [move])

  function inspectVlan(id: string) {
    if (!id) { select(null); return }
    select({ kind: 'vlan', id })
    void flow.fitView({ nodes: [{ id: `vlan:${id}` }], padding: .4, maxZoom: 1, duration: 0 })
  }

  function inspectSubnet(id: string) {
    if (!id) { select(null); return }
    select({ kind: 'subnet', id })
    void flow.fitView({ nodes: [{ id: `subnet:${id}` }], padding: .4, maxZoom: 1, duration: 0 })
  }

  function inspectInterface(id: string) {
    if (!id) { select(null); return }
    select({ kind: 'interface', id })
    void flow.fitView({ nodes: [{ id: `iface:${id}` }], padding: .4, maxZoom: 1, duration: 0 })
  }

  return <div className="workspace-grid topology-grid">
    <div className="work-area topology-work-area">
      <header className="page-heading"><p className="section-index">Topology / Logical</p><h1>Logical topology</h1><p>View VLANs, subnets, and their interfaces. VLAN colors indicate membership.</p></header>
      <section className="device-palette" aria-label="Logical palette">
        <div><h2>VLANs and interfaces</h2><p className="help">Create VLANs here, assign subnets in the inspector, and add interfaces in the Physical workspace.</p></div>
        <VlanCreator />
      </section>
      <div className="canvas-toolbar">
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void flow.fitView({ padding: .15, maxZoom: 1, duration: 0 })}>Fit view</button><button type="button" onClick={() => void flow.zoomIn()}>Zoom in</button><button type="button" onClick={() => void flow.zoomOut()}>Zoom out</button></div>
        <button type="button" onClick={() => { select(null); setFeedback('') }}>Clear selection</button>
      </div>
      <div className="topology-canvas" ref={canvas} role="region" aria-label="Logical network canvas">
        <ReactFlow<LogicalNode, Edge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
          isValidConnection={() => false} connectionMode={ConnectionMode.Loose} defaultEdgeOptions={defaultEdgeOptions}
          onNodeClick={(_, node) => {
            if (node.type === 'vlan') select({ kind: 'vlan', id: node.data.vlanId })
            else if (node.type === 'subnet') select({ kind: 'subnet', id: node.data.subnetId })
            else select({ kind: 'interface', id: node.data.interfaceId })
          }}
          onPaneClick={() => select(null)}
          onlyRenderVisibleElements deleteKeyCode={null} minZoom={.1} maxZoom={2}
          onInit={(instance) => { if (nodes.length) void instance.fitView({ padding: .15, maxZoom: 1, duration: 0 }) }}
          nodesDraggable nodesConnectable={false} elementsSelectable snapToGrid snapGrid={[10, 10]}>
          {!nodes.length && <div className="canvas-empty"><strong>No VLANs yet</strong><p>Add a VLAN above, then assign a subnet or add an interface in Physical.</p></div>}
        </ReactFlow>
      </div>
      <div className="canvas-footer"><span>{vlans.length} VLANs · {subnets.length} subnets · {interfaces.length} interfaces</span><span>Drag headers to move nodes. Positions are saved separately from the physical view.</span></div>
      {feedback && <p role="status" className="notice mt-3">{feedback}</p>}
      <section className="panel topology-tools mt-5" aria-labelledby="logical-tools-title">
        <h2 id="logical-tools-title">Find & inspect</h2>
        <div className="find-fields mt-4"><div className="field"><label htmlFor="find-vlan">Inspect VLAN</label><select id="find-vlan" value={selection?.kind === 'vlan' ? selection.id : ''} onChange={(event) => inspectVlan(event.target.value)}><option value="">Choose a VLAN</option>{vlans.map((vlan) => <option key={vlan.id} value={vlan.id}>VLAN {vlan.number}: {vlan.name}</option>)}</select></div>
          <div className="field"><label htmlFor="find-subnet">Inspect Subnet</label><select id="find-subnet" value={selection?.kind === 'subnet' ? selection.id : ''} onChange={(event) => inspectSubnet(event.target.value)}><option value="">Choose a subnet</option>{subnets.map((subnet) => <option key={subnet.id} value={subnet.id}>{subnet.name} ({subnet.cidr})</option>)}</select></div>
          <div className="field"><label htmlFor="find-interface">Inspect Interface</label><select id="find-interface" value={selection?.kind === 'interface' ? selection.id : ''} onChange={(event) => inspectInterface(event.target.value)}><option value="">Choose an interface</option>{interfaces.map((iface) => { const dev = devices.find((d) => d.id === iface.deviceId); return <option key={iface.id} value={iface.id}>{dev?.name ?? 'Unknown'} / {iface.name} ({iface.kind})</option>})}</select></div></div>
        <p className="help mt-3">Lines show VLAN membership through an assigned subnet when available. Interface nodes name their device. This view does not simulate routing.</p>
      </section>
    </div>
    <LogicalInspector />
  </div>
}

function LogicalInspector() {
  const selection = useTopologyUiStore((state) => state.selection)
  const select = useTopologyUiStore((state) => state.select)
  const vlans = useProjectStore((state) => state.project.vlans)
  const subnets = useProjectStore((state) => state.project.subnets)
  const interfaces = useProjectStore((state) => state.project.interfaces)
  const devices = useProjectStore((state) => state.project.devices)
  const ports = useProjectStore((state) => state.project.ports)

  const vlan = selection?.kind === 'vlan' ? vlans.find((v) => v.id === selection.id) : null
  const subnet = selection?.kind === 'subnet' ? subnets.find((s) => s.id === selection.id) : null
  const iface = selection?.kind === 'interface' ? interfaces.find((i) => i.id === selection.id) : null

  const title = vlan ? `VLAN ${vlan.number}: ${vlan.name}` : subnet ? `Subnet: ${subnet.name}` : iface ? `Interface: ${iface.name}` : 'Logical inspector'

  return <aside className="inspector topology-inspector" aria-label="Logical inspector">
    <div className="section-heading"><h2>{title}</h2>{selection && <button type="button" className="text-button" onClick={() => select(null)}>Close inspector</button>}</div>
    {vlan ? <VlanEditor key={vlan.id} vlan={vlan} interfaces={interfaces} select={select} /> :
     subnet ? <SubnetEditor key={subnet.id} subnet={subnet} vlans={vlans} select={select} /> :
     iface ? <InterfaceEditor key={iface.id} iface={iface} devices={devices} ports={ports} vlans={vlans} select={select} /> : <>
      <p>Select a VLAN, subnet, or interface to edit it.</p>
      <hr /><h3>Build a logical plan</h3>
      <ol className="reference-list"><li>Add VLANs with numbers and names.</li><li>Assign subnets to VLANs (one subnet per VLAN).</li><li>Create interfaces on devices: physical (port), subinterface, SVI, or loopback.</li><li>Assign interfaces to VLANs and set IP addresses.</li></ol>
      <p className="help">VLAN colors are derived from VLAN number. This view shows Layer 2/3 structure only.</p>
    </>}
  </aside>
}

function VlanEditor({ vlan, interfaces, select }: { vlan: { id: string; number: number; name: string }; interfaces: { id: string; name: string; kind: string; vlanId: string | null }[]; select: (s: TopologySelection) => void }) {
  const [name, setName] = useState(vlan.name)
  const [number, setNumber] = useState(String(vlan.number))
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const updateVlan = useProjectStore((state) => state.updateVlan)
  const deleteVlan = useProjectStore((state) => state.deleteVlan)

  return <>
    <form onSubmit={(e) => { e.preventDefault(); try { updateVlan(vlan.id, { name, number: Number(number) }); setFeedback('VLAN updated.'); setError('') } catch (cause) { setError(errorMessage(cause)) } }}>
      <div className="field"><label htmlFor="vlan-number">VLAN number</label><input id="vlan-number" type="number" min="1" max="4094" step="1" value={number} onChange={(e) => setNumber(e.target.value)} /></div>
      <div className="field"><label htmlFor="vlan-name">VLAN name</label><input id="vlan-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      {error && <p className="error mb-4" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2"><button type="submit" className="primary">Apply VLAN</button><button type="button" onClick={() => select(null)}>Cancel</button></div>
    </form>
    {feedback && <p role="status" className="notice mt-4">{feedback}</p>}
    <hr />
    <h3>Interfaces in this VLAN ({interfaces.filter((i) => i.vlanId === vlan.id).length})</h3>
    {interfaces.filter((i) => i.vlanId === vlan.id).map((iface) => (
      <button key={iface.id} type="button" className="inspector-port-list" onClick={() => select({ kind: 'interface', id: iface.id })}><span className="address">{iface.name}</span><span>{iface.kind}</span></button>
    ))}
    <hr />
    <button type="button" className="danger-button" onClick={() => {
      if (!window.confirm(`Delete VLAN ${vlan.number} (${vlan.name})?`)) return
      try { deleteVlan(vlan.id); select(null) } catch (cause) { alert(errorMessage(cause)) }
    }}>Delete VLAN</button>
  </>
}

function SubnetEditor({ subnet, vlans, select }: { subnet: { id: string; name: string; cidr: string; gatewayIp: string | null; vlanId: string | null }; vlans: { id: string; number: number; name: string }[]; select: (s: TopologySelection) => void }) {
  const [vlanId, setVlanId] = useState(subnet.vlanId ?? '')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const assignSubnetToVlan = useProjectStore((state) => state.assignSubnetToVlan)

  return <>
    <form onSubmit={(e) => { e.preventDefault(); try { assignSubnetToVlan(subnet.id, vlanId || null); setFeedback('Subnet VLAN assignment updated.'); setError('') } catch (cause) { setError(errorMessage(cause)) } }}>
      <div className="field"><label htmlFor="subnet-vlan">Assign to VLAN</label><select id="subnet-vlan" value={vlanId} onChange={(e) => setVlanId(e.target.value)}><option value="">No VLAN (Layer 3 only)</option>{vlans.map((v) => <option key={v.id} value={v.id}>VLAN {v.number}: {v.name}</option>)}</select></div>
      <p className="help mb-3">{subnet.name}: {subnet.cidr}. Gateway: {subnet.gatewayIp ?? 'none'}.</p>
      {error && <p className="error mb-4" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2"><button type="submit" className="primary">Apply</button><button type="button" onClick={() => select(null)}>Cancel</button></div>
    </form>
    {feedback && <p role="status" className="notice mt-4">{feedback}</p>}
    <hr />
    <p className="help">Edit the CIDR, gateway, and host requirement in the Planner workspace.</p>
  </>
}

function InterfaceEditor({ iface, devices, ports, vlans, select }: { iface: { id: string; deviceId: string; kind: 'physical' | 'subinterface' | 'SVI' | 'loopback'; name: string; portId: string | null; vlanId: string | null; address: string | null }; devices: { id: string; name: string }[]; ports: { id: string; deviceId: string; name: string }[]; vlans: { id: string; number: number; name: string }[]; select: (s: TopologySelection) => void }) {
  const [kind, setKind] = useState(iface.kind)
  const [name, setName] = useState(iface.name)
  const [portId, setPortId] = useState(iface.portId ?? '')
  const [vlanId, setVlanId] = useState(iface.vlanId ?? '')
  const [address, setAddress] = useState(iface.address ?? '')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const updateInterface = useProjectStore((state) => state.updateInterface)
  const deleteInterface = useProjectStore((state) => state.deleteInterface)
  const device = devices.find((d) => d.id === iface.deviceId)
  const devicePorts = device ? ports.filter((p) => p.deviceId === device.id) : []

  return <>
    <form onSubmit={(e) => { e.preventDefault(); try { updateInterface(iface.id, { kind, name, portId: kind === 'physical' ? portId : null, vlanId: vlanId || null, address: address || null }); setFeedback('Interface updated.'); setError('') } catch (cause) { setError(errorMessage(cause)) } }}>
      <div className="field"><label htmlFor="iface-kind">Kind</label><select id="iface-kind" value={kind} onChange={(e) => setKind(e.target.value as 'physical' | 'subinterface' | 'SVI' | 'loopback')}><option value="physical">Physical</option><option value="subinterface">Subinterface</option><option value="SVI">SVI</option><option value="loopback">Loopback</option></select></div>
      <div className="field"><label htmlFor="iface-name">Interface name</label><input id="iface-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      {kind === 'physical' && devicePorts.length > 0 && <div className="field"><label htmlFor="iface-port">Physical port</label><select id="iface-port" value={portId} onChange={(e) => setPortId(e.target.value)}><option value="">Choose a port</option>{devicePorts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
      <div className="field"><label htmlFor="iface-vlan">VLAN</label><select id="iface-vlan" value={vlanId} onChange={(e) => setVlanId(e.target.value)}><option value="">No VLAN</option>{vlans.map((v) => <option key={v.id} value={v.id}>VLAN {v.number}: {v.name}</option>)}</select></div>
      <div className="field"><label htmlFor="iface-address">IP address / prefix</label><input id="iface-address" className="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.168.10.1/24" spellCheck={false} /></div>
      {error && <p className="error mb-4" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2"><button type="submit" className="primary">Apply interface</button><button type="button" onClick={() => select({ kind: 'device', id: iface.deviceId })}>Cancel</button></div>
    </form>
    {feedback && <p role="status" className="notice mt-4">{feedback}</p>}
    <hr />
    <button type="button" className="danger-button" onClick={() => {
      if (!window.confirm(`Delete interface ${iface.name}?`)) return
      deleteInterface(iface.id); select({ kind: 'device', id: iface.deviceId })
    }}>Delete interface</button>
  </>
}

export function LogicalView() {
  return <ReactFlowProvider><LogicalWorkspace /></ReactFlowProvider>
}
