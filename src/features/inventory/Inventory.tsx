import { useRef, useState } from 'react'
import type { Allocation, HardwareItem } from '../../core/schema'
import { getDevicePortDemand, getHardwareSummary, validateHardware } from '../../core/hardware'
import { useProjectStore } from '../../state/projectStore'
import { errorMessage } from '../topology/forms'
import { AllocationForm, HardwareForm } from './InventoryForms'
import './inventory.css'

type Editor = { kind: 'hardware'; item?: HardwareItem } | { kind: 'allocation'; allocation?: Allocation }
const cost = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function Inventory() {
  const project = useProjectStore((s) => s.project)
  const removeHardware = useProjectStore((s) => s.deleteHardwareItem)
  const removeAllocation = useProjectStore((s) => s.deleteAllocation)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const trigger = useRef<HTMLButtonElement | null>(null)
  const addHardwareButton = useRef<HTMLButtonElement | null>(null)
  const allocateButton = useRef<HTMLButtonElement | null>(null)
  const { summary, totalBudget, totalAllocatedCost } = getHardwareSummary(project)
  const issues = validateHardware(project)

  function open(next: Editor, button: HTMLButtonElement) {
    trigger.current = button
    setEditor(next)
    setFeedback('')
    setError('')
  }

  function close(message = '') {
    setEditor(null)
    setFeedback(message)
    trigger.current?.focus()
  }

  function remove(kind: 'hardware' | 'allocation', id: string, label: string) {
    if (!window.confirm(`Delete ${label}? This cannot be undone in this session.`)) return
    try {
      if (kind === 'hardware') removeHardware(id)
      else removeAllocation(id)
      setEditor(null)
      setError('')
      setFeedback(`${kind === 'hardware' ? 'Hardware' : 'Allocation'} deleted.`)
      if (kind === 'hardware') addHardwareButton.current?.focus()
      else allocateButton.current?.focus()
    } catch (cause) { setFeedback(''); setError(errorMessage(cause)) }
  }

  return <div className="work-area inventory-workspace">
    <header className="page-heading"><p className="section-index">05 / Hardware planning</p><h1>Hardware inventory</h1><p>Compare available stock with device and site allocations, costs, and port demand.</p></header>
    {feedback && <p role="status" className="notice mb-4">{feedback}</p>}
    {error && <p role="alert" className="error mb-4">{error}</p>}
    {editor?.kind === 'hardware' && <HardwareForm key={editor.item?.id ?? 'new-hardware'} item={editor.item} onCancel={() => close()} onDone={() => close(editor.item ? 'Hardware updated.' : 'Hardware added.')} />}
    {editor?.kind === 'allocation' && <AllocationForm key={editor.allocation?.id ?? 'new-allocation'} allocation={editor.allocation} project={project} onCancel={() => close()} onDone={() => close(editor.allocation ? 'Allocation updated.' : 'Allocation added.')} />}
    <section className="panel" aria-labelledby="stock-title">
      <div className="section-heading"><h2 id="stock-title">Stock and costs</h2><button ref={addHardwareButton} type="button" className="primary" onClick={(e) => open({ kind: 'hardware' }, e.currentTarget)}>Add hardware</button></div>
      {!summary.length ? <p className="empty-state">No hardware recorded. Add a model with its available quantity, unit cost, and port capacity.</p> : <>
        <div className="table-scroll" role="region" aria-label="Hardware stock" tabIndex={0}><table>
          <thead><tr><th scope="col">Model / category</th><th scope="col">Available</th><th scope="col">Allocated</th><th scope="col">Balance</th><th scope="col">Ports / unit</th><th scope="col">Unit cost</th><th scope="col">Stock cost</th><th scope="col">Actions</th></tr></thead>
          <tbody>{summary.map(({ item, allocatedQty, freeQty, totalCost, isShortage }) => <tr key={item.id}>
            <th scope="row">{item.model}<span className="inventory-secondary">{item.category}</span>{item.capabilities.length > 0 && <span className="inventory-secondary">{item.capabilities.join(', ')}</span>}</th>
            <td>{item.quantityAvailable}</td><td>{allocatedQty}</td><td className={isShortage ? 'inventory-shortage' : undefined}>{isShortage ? `Short ${-freeQty}` : `${freeQty} free`}</td><td>{item.portCount}</td><td>{cost(item.unitCost)}</td><td>{cost(totalCost)}</td>
            <td><div className="inventory-actions"><button type="button" aria-label={`Edit hardware ${item.model}`} onClick={(e) => open({ kind: 'hardware', item }, e.currentTarget)}>Edit</button><button type="button" aria-label={`Delete hardware ${item.model}`} onClick={() => remove('hardware', item.id, item.model)}>Delete</button></div></td>
          </tr>)}</tbody>
        </table></div>
        <dl className="inventory-totals"><div><dt>Stock cost</dt><dd>{cost(totalBudget)}</dd></div><div><dt>Allocated cost</dt><dd>{cost(totalAllocatedCost)}</dd></div></dl>
        <p className="help">Costs use your entered unit prices and a single currency. Allocated cost includes planned units beyond available stock.</p>
      </>}
    </section>
    <section className="panel" aria-labelledby="allocations-title">
      <div className="section-heading"><h2 id="allocations-title">Allocations</h2>{project.hardwareItems.length > 0 && <button ref={allocateButton} type="button" onClick={(e) => open({ kind: 'allocation' }, e.currentTarget)}>Allocate hardware</button>}</div>
      {!project.allocations.length ? <p className="empty-state">{project.hardwareItems.length ? 'No allocations yet. Allocate hardware to a device or site to compare demand with stock.' : 'Add hardware before allocating it to a device or site.'}</p> : <div className="table-scroll" role="region" aria-label="Hardware allocations" tabIndex={0}><table>
        <thead><tr><th scope="col">Hardware model</th><th scope="col">Assigned to</th><th scope="col">Quantity</th><th scope="col">Allocated cost</th><th scope="col">Actions</th></tr></thead>
        <tbody>{project.allocations.map((allocation) => {
          const item = project.hardwareItems.find((h) => h.id === allocation.hardwareItemId)
          const device = project.devices.find((d) => d.id === allocation.deviceId)
          const label = `${item?.model ?? 'Missing hardware'} / ${allocation.deviceId ? device?.name ?? 'Missing device' : allocation.scope}`
          return <tr key={allocation.id}><th scope="row">{item?.model ?? 'Missing hardware'}</th><td>{allocation.deviceId ? device?.name ?? 'Missing device' : allocation.scope}<span className="inventory-secondary">{allocation.deviceId ? `Device${device ? ` / ${device.scope}` : ''}` : 'Site / scope'}</span></td><td>{allocation.quantity}</td><td>{item ? cost(item.unitCost * allocation.quantity) : 'Unknown'}</td><td><div className="inventory-actions"><button type="button" aria-label={`Edit allocation ${label}`} onClick={(e) => open({ kind: 'allocation', allocation }, e.currentTarget)}>Edit</button><button type="button" aria-label={`Delete allocation ${label}`} onClick={() => remove('allocation', allocation.id, `allocation ${label}`)}>Delete</button></div></td></tr>
        })}</tbody>
      </table></div>}
    </section>
    <section className="panel" aria-labelledby="ports-title">
      <h2 id="ports-title">Device port capacity</h2>
      <p className="help mb-4">Demand counts named ports in Physical. Supply sums ports per unit across all hardware allocated to that device; it does not check speed, media, or capabilities.</p>
      {!project.devices.length ? <p className="empty-state">Add devices and ports in the Physical workspace to compare port demand with allocated capacity.</p> : <div className="table-scroll" role="region" aria-label="Device port capacity table" tabIndex={0}><table>
        <thead><tr><th scope="col">Device / site</th><th scope="col">Port demand</th><th scope="col">Allocated ports</th><th scope="col">Capacity check</th></tr></thead>
        <tbody>{project.devices.map((device) => {
          const { demand, supply, shortage } = getDevicePortDemand(project, device.id)
          const assigned = project.allocations.some((a) => a.deviceId === device.id)
          return <tr key={device.id}><th scope="row">{device.name}<span className="inventory-secondary">{device.scope}</span></th><td>{demand}</td><td>{assigned ? supply : 'Unassigned'}</td><td className={shortage ? 'inventory-shortage' : undefined}>{!assigned ? 'Allocate hardware to check capacity' : shortage ? `Short ${demand - supply} ports` : `${supply - demand} spare ports`}</td></tr>
        })}</tbody>
      </table></div>}
    </section>
    {issues.length > 0 && <section className="error" aria-labelledby="hardware-issues-title"><h2 id="hardware-issues-title">Hardware issues ({issues.length})</h2><ul>{issues.map((issue, index) => <li key={`${index}:${issue}`}>{issue}</li>)}</ul><p>Adjust stock, allocations, or device ports to resolve these issues.</p></section>}
  </div>
}
