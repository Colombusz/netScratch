import { useRef, useState } from 'react'
import type { Interface } from '../../core/schema'
import { useProjectStore } from '../../state/projectStore'
import { EditorForm, errorMessage } from './forms'

function InterfaceForm({ deviceId, iface, onDone, onCancel }: { deviceId: string; iface?: Interface; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(iface?.name ?? '')
  const [kind, setKind] = useState<Interface['kind']>(iface?.kind ?? 'physical')
  const [portId, setPortId] = useState(iface?.portId ?? '')
  const [vlanId, setVlanId] = useState(iface?.vlanId ?? '')
  const [address, setAddress] = useState(iface?.address ?? '')
  const project = useProjectStore((s) => s.project)
  const add = useProjectStore((s) => s.addInterface)
  const update = useProjectStore((s) => s.updateInterface)
  const ports = project.ports.filter((port) => port.deviceId === deviceId)

  return <EditorForm submitLabel={iface ? 'Apply interface' : 'Save interface'} onCancel={onCancel} onSubmit={() => {
    const details = { name, kind, portId: kind === 'physical' ? portId || null : null, vlanId: vlanId || null, address: address.trim() || null }
    if (iface) update(iface.id, details)
    else add(deviceId, details)
    onDone()
  }}>
    <h3 className="mb-3">{iface ? 'Edit interface' : 'New interface'}</h3>
    <div className="field"><label htmlFor="physical-iface-name">Interface name</label><input id="physical-iface-name" autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></div>
    <div className="field"><label htmlFor="physical-iface-kind">Interface kind</label><select id="physical-iface-kind" value={kind} onChange={(event) => setKind(event.target.value as Interface['kind'])}><option value="physical">Physical</option><option value="subinterface">Subinterface</option><option value="SVI">SVI</option><option value="loopback">Loopback</option></select></div>
    {kind === 'physical' && <div className="field"><label htmlFor="physical-iface-port">Physical port</label><select id="physical-iface-port" value={portId} onChange={(event) => setPortId(event.target.value)}><option value="">Choose a port</option>{ports.map((port) => <option key={port.id} value={port.id}>{port.name}</option>)}</select>{!ports.length && <p className="help">Add a named port to this device first.</p>}</div>}
    <div className="field"><label htmlFor="physical-iface-vlan">Interface VLAN</label><select id="physical-iface-vlan" value={vlanId} onChange={(event) => setVlanId(event.target.value)}><option value="">No VLAN</option>{project.vlans.map((vlan) => <option key={vlan.id} value={vlan.id}>{vlan.number}: {vlan.name}</option>)}</select><p className="help">Create VLANs in the Logical workspace.</p></div>
    <div className="field"><label htmlFor="physical-iface-address">Interface address / prefix</label><input id="physical-iface-address" className="address" spellCheck={false} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="192.168.10.1/24" /><p className="help">Optional IPv4 host address and prefix. Leave blank for an unnumbered interface.</p></div>
  </EditorForm>
}

export function DeviceInterfaces({ deviceId }: { deviceId: string }) {
  const project = useProjectStore((s) => s.project)
  const remove = useProjectStore((s) => s.deleteInterface)
  const [editor, setEditor] = useState<{ iface?: Interface } | null>(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const trigger = useRef<HTMLButtonElement | null>(null)
  const addButton = useRef<HTMLButtonElement | null>(null)
  const interfaces = project.interfaces.filter((iface) => iface.deviceId === deviceId)
  function close(message = '') { setEditor(null); setFeedback(message); trigger.current?.focus() }

  return <section aria-labelledby="device-interfaces-title">
    <div className="section-heading"><h3 id="device-interfaces-title">Interfaces ({interfaces.length})</h3><button ref={addButton} type="button" onClick={(event) => { trigger.current = event.currentTarget; setEditor({}); setFeedback(''); setError('') }}>Add interface</button></div>
    {editor && <InterfaceForm key={editor.iface?.id ?? 'new'} deviceId={deviceId} iface={editor.iface} onCancel={() => close()} onDone={() => close(editor.iface ? 'Interface updated.' : 'Interface added.')} />}
    {feedback && <p role="status" className="notice mt-3">{feedback}</p>}
    {error && <p role="alert" className="error mt-3">{error}</p>}
    {!interfaces.length ? <p className="help">No interfaces yet. Add a physical interface, subinterface, SVI, or loopback.</p> : <ul className="device-interface-list">{interfaces.map((iface) => <li key={iface.id}>
      <strong>{iface.name}</strong><p className="help">{iface.kind}{iface.portId ? ` / ${project.ports.find((port) => port.id === iface.portId)?.name ?? 'Missing port'}` : ''}{iface.address ? ` / ${iface.address}` : ' / Unnumbered'}{iface.vlanId ? ` / VLAN ${project.vlans.find((vlan) => vlan.id === iface.vlanId)?.number ?? 'missing'}` : ''}</p>
      <div className="flex flex-wrap gap-2"><button type="button" aria-label={`Edit interface ${iface.name}`} onClick={(event) => { trigger.current = event.currentTarget; setEditor({ iface }); setFeedback(''); setError('') }}>Edit</button><button type="button" aria-label={`Delete interface ${iface.name}`} onClick={() => {
        if (!window.confirm(`Delete interface ${iface.name}? Notes and tasks will remain unattached. This cannot be undone in this session.`)) return
        try { remove(iface.id); setEditor(null); setFeedback('Interface deleted.'); setError(''); addButton.current?.focus() }
        catch (cause) { setError(errorMessage(cause)) }
      }}>Delete</button></div>
    </li>)}</ul>}
  </section>
}
