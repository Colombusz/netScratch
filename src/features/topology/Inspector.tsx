import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { Device, Link, Port } from '../../core/schema'
import { useProjectStore } from '../../state/projectStore'
import { useTopologyUiStore } from '../../state/topologyUiStore'
import { EditorForm, MediaField, roles, titleCase } from './forms'

function PortCreator({ device }: { device: Device }) {
  const [bulk, setBulk] = useState(false)
  const [name, setName] = useState('Gi0/1')
  const [prefix, setPrefix] = useState('Gi0/')
  const [start, setStart] = useState('1')
  const [count, setCount] = useState('24')
  const [speed, setSpeed] = useState('1 Gbps')
  const [media, setMedia] = useState<Port['media']>('copper')
  const [feedback, setFeedback] = useState('')
  const addPorts = useProjectStore((state) => state.addPorts)
  const addBulkPorts = useProjectStore((state) => state.addBulkPorts)

  return <section aria-labelledby="add-ports-title">
    <h3 id="add-ports-title">Add ports</h3>
    <div className="editor-tabs"><button type="button" aria-pressed={!bulk} onClick={() => { setBulk(false); setFeedback('') }}>One port</button><button type="button" aria-pressed={bulk} onClick={() => { setBulk(true); setFeedback('') }}>Port range</button></div>
    <EditorForm key={bulk ? 'bulk' : 'single'} submitLabel={bulk ? 'Add port range' : 'Add port'} onSubmit={() => {
      setFeedback('')
      if (bulk) addBulkPorts(device.id, { prefix, start: Number(start), count: Number(count), speed, media })
      else addPorts(device.id, [{ name, speed, media }])
      setFeedback(bulk ? `${count} ports added to ${device.name}.` : `${name} added to ${device.name}.`)
    }}>
      {bulk ? <>
        <div className="field"><label htmlFor="port-prefix">Name prefix</label><input id="port-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} /></div>
        <div className="field-pair"><div className="field"><label htmlFor="port-start">Start number</label><input id="port-start" type="number" min="0" step="1" value={start} onChange={(e) => setStart(e.target.value)} /></div><div className="field"><label htmlFor="port-count">Port count</label><input id="port-count" type="number" min="1" max="256" step="1" value={count} onChange={(e) => setCount(e.target.value)} /></div></div>
        <p className="help mb-4">For example, prefix Gi0/, start 1, count 24 creates Gi0/1 through Gi0/24. Up to 256 ports per batch.</p>
      </> : <div className="field"><label htmlFor="new-port-name">Port name</label><input id="new-port-name" value={name} onChange={(e) => setName(e.target.value)} /></div>}
      <div className="field"><label htmlFor="new-port-speed">Port speed</label><input id="new-port-speed" value={speed} onChange={(e) => setSpeed(e.target.value)} /></div>
      <MediaField id="new-port-media" value={media} onChange={setMedia} />
    </EditorForm>
    {feedback && <p role="status" className="notice mt-4">{feedback}</p>}
  </section>
}

function PositionEditor({ deviceId, x, y }: { deviceId: string; x: number; y: number }) {
  const [left, setLeft] = useState(String(x))
  const [top, setTop] = useState(String(y))
  const move = useProjectStore((state) => state.moveDevices)
  return <EditorForm submitLabel="Apply position" onSubmit={() => {
    if (!left.trim() || !top.trim()) throw new Error('Enter both coordinates.')
    move([{ id: deviceId, position: { x: Number(left), y: Number(top) } }])
  }}>
    <h3 className="mb-3">Canvas position</h3>
    <div className="field-pair"><div className="field"><label htmlFor="device-x">X position</label><input id="device-x" type="number" value={left} onChange={(e) => setLeft(e.target.value)} /></div><div className="field"><label htmlFor="device-y">Y position</label><input id="device-y" type="number" value={top} onChange={(e) => setTop(e.target.value)} /></div></div>
  </EditorForm>
}

function DeviceEditor({ device }: { device: Device }) {
  const [name, setName] = useState(device.name)
  const [role, setRole] = useState(device.role)
  const [scope, setScope] = useState(device.scope)
  const [feedback, setFeedback] = useState('')
  const update = useProjectStore((state) => state.updateDevice)
  const remove = useProjectStore((state) => state.deleteDevice)
  const select = useTopologyUiStore((state) => state.select)
  const ports = useProjectStore(useShallow((state) => state.project.ports.filter((port) => port.deviceId === device.id)))
  const position = useProjectStore((state) => state.project.layout.physical[device.id]) ?? { x: 0, y: 0 }

  function deleteSelectedDevice() {
    const portIds = new Set(ports.map((port) => port.id))
    const cableCount = useProjectStore.getState().project.links.filter((link) => portIds.has(link.sourcePortId) || portIds.has(link.targetPortId)).length
    if (!window.confirm(`Delete ${device.name}? This removes ${ports.length} ports and ${cableCount} cables. This cannot be undone in Phase 2.`)) return
    remove(device.id)
    select(null)
  }

  return <>
    <EditorForm submitLabel="Apply device" onSubmit={() => { update(device.id, { name, role, scope }); setFeedback('Device updated. Port and cable IDs are unchanged.') }} onCancel={() => select(null)}>
      <div className="field"><label htmlFor="device-name">Device name</label><input id="device-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label htmlFor="device-role">Device role</label><select id="device-role" value={role} onChange={(e) => setRole(e.target.value as Device['role'])}>{roles.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></div>
      <div className="field"><label htmlFor="device-scope">Site / routing scope</label><input id="device-scope" value={scope} onChange={(e) => setScope(e.target.value)} /></div>
    </EditorForm>
    {feedback && <p role="status" className="notice mt-4">{feedback}</p>}
    <hr />
    <PositionEditor key={`${position.x}:${position.y}`} deviceId={device.id} x={position.x} y={position.y} />
    <hr />
    <PortCreator device={device} />
    <h3 className="mt-6 mb-2">Ports ({ports.length})</h3>
    {ports.length ? <ul className="inspector-port-list">{ports.map((port) => <li key={port.id}><button type="button" onClick={() => select({ kind: 'port', id: port.id })}><span className="address">{port.name}</span><span>{port.speed}</span></button></li>)}</ul> : <p className="help">Add a named port before connecting this device.</p>}
    <hr /><button type="button" className="danger-button" onClick={deleteSelectedDevice}>Delete device</button>
  </>
}

function PortEditor({ port }: { port: Port }) {
  const [name, setName] = useState(port.name)
  const [speed, setSpeed] = useState(port.speed)
  const [media, setMedia] = useState(port.media)
  const [feedback, setFeedback] = useState('')
  const device = useProjectStore((state) => state.project.devices.find((d) => d.id === port.deviceId))
  const cable = useProjectStore((state) => state.project.links.find((link) => link.sourcePortId === port.id || link.targetPortId === port.id))
  const update = useProjectStore((state) => state.updatePort)
  const remove = useProjectStore((state) => state.deletePort)
  const select = useTopologyUiStore((state) => state.select)
  return <>
    <p className="help mb-4">{device?.name} / {port.name}</p>
    <EditorForm submitLabel="Apply port" onSubmit={() => { update(port.id, { name, speed, media }); setFeedback('Port updated. Its cable stays connected.') }} onCancel={() => select({ kind: 'device', id: port.deviceId })}>
      <div className="field"><label htmlFor="edit-port-name">Port name</label><input id="edit-port-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label htmlFor="edit-port-speed">Port speed</label><input id="edit-port-speed" value={speed} onChange={(e) => setSpeed(e.target.value)} /></div>
      <MediaField id="edit-port-media" value={media} onChange={setMedia} />
    </EditorForm>
    {feedback && <p role="status" className="notice mt-4">{feedback}</p>}
    <hr />
    {cable ? <><p className="help mb-3">Connected using {cable.cableType}{cable.label ? `: ${cable.label}` : ''}.</p><button type="button" onClick={() => select({ kind: 'link', id: cable.id })}>Inspect cable</button></>
      : <><p className="help mb-3">This port is free.</p><button type="button" onClick={() => select({ kind: 'connect', id: port.id })}>Connect this port</button></>}
    <hr />
    <button type="button" className="danger-button" onClick={() => {
      if (!window.confirm(`Delete port ${port.name}${cable ? ' and its cable' : ''}? This cannot be undone in Phase 2.`)) return
      remove(port.id); select({ kind: 'device', id: port.deviceId })
    }}>Delete port</button>
  </>
}

function CableEditor({ cable, initialSource }: { cable?: Link; initialSource?: string }) {
  const ports = useProjectStore((state) => state.project.ports)
  const devices = useProjectStore((state) => state.project.devices)
  const links = useProjectStore((state) => state.project.links)
  const save = useProjectStore((state) => state.saveCable)
  const remove = useProjectStore((state) => state.deleteCable)
  const select = useTopologyUiStore((state) => state.select)
  const occupied = new Set(links.filter((link) => link.id !== cable?.id).flatMap((link) => [link.sourcePortId, link.targetPortId]))
  const available = ports.filter((port) => !occupied.has(port.id))
  const [sourcePortId, setSource] = useState(cable?.sourcePortId ?? initialSource ?? available[0]?.id ?? '')
  const [targetPortId, setTarget] = useState(cable?.targetPortId ?? available.find((port) => port.id !== sourcePortId)?.id ?? '')
  const [cableType, setCableType] = useState(cable?.cableType ?? 'Cat6')
  const [label, setLabel] = useState(cable?.label ?? '')
  const [feedback, setFeedback] = useState('')
  const names = new Map(devices.map((device) => [device.id, device.name]))
  if (!cable && available.length < 2) return <p className="notice">Add at least two free named ports to connect a cable. Each physical port supports one cable.</p>
  return <>
    <EditorForm submitLabel={cable ? 'Apply cable' : 'Connect ports'} onCancel={() => select(null)} onSubmit={() => {
      const id = save({ sourcePortId, targetPortId, cableType, label }, cable?.id)
      setFeedback('Cable applied between the selected ports.')
      select({ kind: 'link', id })
    }}>
      <p className="help mb-4">Cables connect physical ports. End A and End B do not imply traffic direction.</p>
      <div className="field"><label htmlFor="cable-source">End A</label><select id="cable-source" value={sourcePortId} onChange={(e) => setSource(e.target.value)}><option value="">Choose a port</option>{ports.map((port) => <option key={port.id} value={port.id} disabled={occupied.has(port.id)}>{names.get(port.deviceId)} / {port.name}{occupied.has(port.id) ? ' (occupied)' : ''}</option>)}</select></div>
      <div className="field"><label htmlFor="cable-target">End B</label><select id="cable-target" value={targetPortId} onChange={(e) => setTarget(e.target.value)}><option value="">Choose a port</option>{ports.map((port) => <option key={port.id} value={port.id} disabled={occupied.has(port.id) || port.id === sourcePortId}>{names.get(port.deviceId)} / {port.name}{occupied.has(port.id) ? ' (occupied)' : ''}</option>)}</select></div>
      <div className="field"><label htmlFor="cable-type">Cable type</label><input id="cable-type" value={cableType} onChange={(e) => setCableType(e.target.value)} placeholder="Cat6, fiber, DAC…" /></div>
      <div className="field"><label htmlFor="cable-label">Cable label</label><input id="cable-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="For example, rack uplink" /></div>
    </EditorForm>
    {feedback && <p role="status" className="notice mt-4">{feedback}</p>}
    {cable && <><hr /><button type="button" className="danger-button" onClick={() => {
      if (!window.confirm('Delete this cable? Both ports will become free.')) return
      remove(cable.id); select(null)
    }}>Delete cable</button></>}
  </>
}

export function TopologyInspector() {
  const selection = useTopologyUiStore((state) => state.selection)
  const select = useTopologyUiStore((state) => state.select)
  const device = useProjectStore((state) => state.project.devices.find((item) => selection?.kind === 'device' && item.id === selection.id))
  const port = useProjectStore((state) => state.project.ports.find((item) => selection?.kind === 'port' && item.id === selection.id))
  const cable = useProjectStore((state) => state.project.links.find((item) => selection?.kind === 'link' && item.id === selection.id))
  const title = device ? 'Device inspector' : port ? 'Port inspector' : cable ? 'Cable inspector' : selection?.kind === 'connect' ? 'Connect ports' : 'Topology inspector'

  return <aside className="inspector topology-inspector" aria-label="Topology inspector">
    <div className="section-heading"><h2>{title}</h2>{selection && <button type="button" className="text-button" onClick={() => select(null)}>Close inspector</button>}</div>
    {device ? <DeviceEditor key={device.id} device={device} /> : port ? <PortEditor key={port.id} port={port} /> : cable ? <CableEditor key={cable.id} cable={cable} /> : selection?.kind === 'connect' ? <CableEditor key={`connect:${selection.id}`} initialSource={selection.id || undefined} /> : <>
      <p>Choose a device, port row, or cable to edit it.</p>
      <hr /><h3>Build a physical plan</h3>
      <ol className="reference-list"><li>Drag a device from the palette, or click to add it.</li><li>Add named ports individually or with a naming prefix and range.</li><li>Drag between free port handles, or use New cable to choose both ends.</li></ol>
      <p className="help">Use the device header to move it. The inspector also accepts X/Y coordinates for keyboard placement.</p>
      <p className="help">Site outlines group devices sharing the same routing scope. They do not assign subnets or simulate communication.</p>
    </>}
  </aside>
}
