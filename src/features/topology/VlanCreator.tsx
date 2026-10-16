import { useRef, useState } from 'react'
import { useProjectStore } from '../../state/projectStore'
import { useTopologyUiStore } from '../../state/topologyUiStore'
import { EditorForm } from './forms'

export function VlanCreator() {
  const [open, setOpen] = useState(false)
  const [bulk, setBulk] = useState(false)
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [prefix, setPrefix] = useState('')
  const [start, setStart] = useState('')
  const [count, setCount] = useState('')
  const [feedback, setFeedback] = useState('')
  const button = useRef<HTMLButtonElement | null>(null)
  const add = useProjectStore((s) => s.addVlan)
  const addBulk = useProjectStore((s) => s.addBulkVlans)
  const select = useTopologyUiStore((s) => s.select)
  function close() { setOpen(false); button.current?.focus() }

  return <section className="vlan-creator" aria-label="Create VLANs">
    <button ref={button} type="button" onClick={() => { setOpen(true); setFeedback('') }}>Add VLAN</button>
    {open && <div className="mt-4">
      <div className="editor-tabs"><button type="button" aria-pressed={!bulk} onClick={() => setBulk(false)}>One VLAN</button><button type="button" aria-pressed={bulk} onClick={() => setBulk(true)}>VLAN range</button></div>
      <EditorForm key={bulk ? 'bulk' : 'single'} submitLabel={bulk ? 'Save VLAN range' : 'Save VLAN'} onCancel={close} onSubmit={() => {
        if (bulk) {
          if (!start.trim() || !count.trim()) throw new Error('Enter a start number and VLAN count.')
          addBulk({ prefix, start: Number(start), count: Number(count) })
          setFeedback(`${count} VLANs added.`)
        } else {
          if (!number.trim()) throw new Error('Enter a VLAN number.')
          const id = add({ name, number: Number(number) })
          select({ kind: 'vlan', id })
          setFeedback('VLAN added.')
        }
        close()
      }}>
        {bulk ? <div className="find-fields">
          <div className="field"><label htmlFor="new-vlan-prefix">VLAN name prefix</label><input id="new-vlan-prefix" autoFocus value={prefix} onChange={(event) => setPrefix(event.target.value)} /></div>
          <div className="field"><label htmlFor="new-vlan-start">Start VLAN number</label><input id="new-vlan-start" type="number" min="1" max="4094" value={start} onChange={(event) => setStart(event.target.value)} /></div>
          <div className="field"><label htmlFor="new-vlan-count">VLAN count</label><input id="new-vlan-count" type="number" min="1" max="100" value={count} onChange={(event) => setCount(event.target.value)} /></div>
        </div> : <div className="find-fields">
          <div className="field"><label htmlFor="new-vlan-number">New VLAN number</label><input id="new-vlan-number" autoFocus type="number" min="1" max="4094" value={number} onChange={(event) => setNumber(event.target.value)} /></div>
          <div className="field"><label htmlFor="new-vlan-name">New VLAN name</label><input id="new-vlan-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
        </div>}
      </EditorForm>
    </div>}
    {feedback && <p role="status" className="notice mt-3">{feedback}</p>}
  </section>
}
