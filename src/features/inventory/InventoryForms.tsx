import { useState } from 'react'
import type { Allocation, HardwareItem, Project } from '../../core/schema'
import { useProjectStore } from '../../state/projectStore'
import { EditorForm } from '../topology/forms'

function numberInput(value: string, label: string): number {
  if (!value.trim()) throw new Error(`Enter ${label}.`)
  return Number(value)
}

export function HardwareForm({ item, onDone, onCancel }: { item?: HardwareItem; onDone: () => void; onCancel: () => void }) {
  const [model, setModel] = useState(item?.model ?? '')
  const [category, setCategory] = useState(item?.category ?? '')
  const [quantity, setQuantity] = useState(String(item?.quantityAvailable ?? 0))
  const [cost, setCost] = useState(String(item?.unitCost ?? 0))
  const [ports, setPorts] = useState(String(item?.portCount ?? 0))
  const [capabilities, setCapabilities] = useState(item?.capabilities.join(', ') ?? '')
  const add = useProjectStore((s) => s.addHardwareItem)
  const update = useProjectStore((s) => s.updateHardwareItem)

  return <section className="panel inventory-editor" aria-labelledby="hardware-editor-title">
    <h2 id="hardware-editor-title">{item ? 'Edit hardware' : 'New hardware'}</h2>
    <EditorForm submitLabel={item ? 'Apply hardware' : 'Save hardware'} onCancel={onCancel} onSubmit={() => {
      const details = {
        model, category, quantityAvailable: numberInput(quantity, 'the available quantity'),
        unitCost: numberInput(cost, 'the unit cost'), portCount: numberInput(ports, 'the ports per unit'),
        capabilities: capabilities.split(',').map((value) => value.trim()).filter(Boolean),
      }
      if (item) update(item.id, details)
      else add(details)
      onDone()
    }}>
      <div className="inventory-fields">
        <div className="field"><label htmlFor="hardware-model">Model</label><input id="hardware-model" autoFocus required value={model} onChange={(e) => setModel(e.target.value)} /></div>
        <div className="field"><label htmlFor="hardware-category">Category</label><input id="hardware-category" required value={category} onChange={(e) => setCategory(e.target.value)} /></div>
        <div className="field"><label htmlFor="hardware-quantity">Available quantity</label><input id="hardware-quantity" type="number" min="0" step="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
        <div className="field"><label htmlFor="hardware-cost">Unit cost</label><input id="hardware-cost" type="number" min="0" step="any" required value={cost} onChange={(e) => setCost(e.target.value)} /></div>
        <div className="field"><label htmlFor="hardware-ports">Ports per unit</label><input id="hardware-ports" type="number" min="0" step="1" required value={ports} onChange={(e) => setPorts(e.target.value)} /></div>
        <div className="field"><label htmlFor="hardware-capabilities">Capabilities (comma separated)</label><input id="hardware-capabilities" value={capabilities} onChange={(e) => setCapabilities(e.target.value)} /></div>
      </div>
      <p className="help mb-4">Use one currency throughout this project. Port counts describe capacity per hardware unit. Compatibility checks recognize explicit tags such as role:switch, media:copper, mode:trunk, and speed:1gbps. Other text is descriptive; missing tags mean unknown support.</p>
    </EditorForm>
  </section>
}

export function AllocationForm({ allocation, project, onDone, onCancel }: {
  allocation?: Allocation; project: Project; onDone: () => void; onCancel: () => void
}) {
  const [hardwareId, setHardwareId] = useState(allocation?.hardwareItemId ?? project.hardwareItems[0]?.id ?? '')
  const [target, setTarget] = useState<'device' | 'scope'>(allocation?.deviceId ? 'device' : 'scope')
  const [deviceId, setDeviceId] = useState(allocation?.deviceId ?? project.devices[0]?.id ?? '')
  const [scope, setScope] = useState(allocation?.scope ?? '')
  const [quantity, setQuantity] = useState(String(allocation?.quantity ?? 1))
  const add = useProjectStore((s) => s.addAllocation)
  const update = useProjectStore((s) => s.updateAllocation)

  return <section className="panel inventory-editor" aria-labelledby="allocation-editor-title">
    <h2 id="allocation-editor-title">{allocation ? 'Edit allocation' : 'New allocation'}</h2>
    <EditorForm submitLabel={allocation ? 'Apply allocation' : 'Save allocation'} onCancel={onCancel} onSubmit={() => {
      if (target === 'device' && !deviceId) throw new Error('Choose a device. Add devices in the Physical workspace first.')
      const details = {
        hardwareItemId: hardwareId, deviceId: target === 'device' ? deviceId : null,
        scope: target === 'scope' ? scope : null, quantity: numberInput(quantity, 'the allocation quantity'),
      }
      if (allocation) update(allocation.id, details)
      else add(details)
      onDone()
    }}>
      <div className="inventory-fields">
        <div className="field"><label htmlFor="allocation-hardware">Hardware model</label><select id="allocation-hardware" autoFocus value={hardwareId} onChange={(e) => setHardwareId(e.target.value)}>{project.hardwareItems.map((item) => <option key={item.id} value={item.id}>{item.model}</option>)}</select></div>
        <div className="field"><label htmlFor="allocation-target">Assign to</label><select id="allocation-target" value={target} onChange={(e) => setTarget(e.target.value as 'device' | 'scope')}><option value="scope">Site / scope</option><option value="device">Device</option></select></div>
        {target === 'scope' ? <div className="field"><label htmlFor="allocation-scope">Site / scope</label><input id="allocation-scope" required value={scope} onChange={(e) => setScope(e.target.value)} /></div>
          : <div className="field"><label htmlFor="allocation-device">Device</label><select id="allocation-device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}><option value="">Choose a device</option>{project.devices.map((device) => <option key={device.id} value={device.id}>{device.name} ({device.scope})</option>)}</select>{!project.devices.length && <p className="help">Add devices in the Physical workspace first.</p>}</div>}
        <div className="field"><label htmlFor="allocation-quantity">Allocation quantity</label><input id="allocation-quantity" type="number" min="1" step="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
      </div>
      <p className="help mb-4">Allocations may exceed stock to record planned purchases. Shortages appear below. Only device allocations count toward device port capacity.</p>
    </EditorForm>
  </section>
}
