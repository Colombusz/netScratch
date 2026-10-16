import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { parseNetwork } from '../../core/cidr'
import { applyPlan, deleteAddressSpace, generatePlan } from '../../core/planning'
import { addressSpaceSchema, type AddressSpace, type Subnet } from '../../core/schema'
import { freeSpace, requirementSchema } from '../../core/vlsm'
import { useProjectStore } from '../../state/projectStore'
import { SubnetEditor } from './SubnetEditor'

type DraftRequirement = { id: string; name: string; hosts: string }
const exampleRows = (): DraftRequirement[] => [['Staff', '100'], ['Admin', '50'], ['Guests', '20']]
  .map(([name, hosts]) => ({ id: crypto.randomUUID(), name: name!, hosts: hosts! }))
const message = (cause: unknown) => cause instanceof z.ZodError
  ? cause.issues.map((i) => `${i.path.join('.') || 'Input'}: ${i.message}`).join('\n') : (cause as Error).message

export function Planner({ target }: { target?: { entityType: string; id: string } }) {
  const project = useProjectStore((s) => s.project)
  const replaceProject = useProjectStore((s) => s.replaceProject)
  const initialSubnet = target?.entityType === 'subnet' ? project.subnets.find((s) => s.id === target.id) : undefined
  const initialSpace = project.addressSpaces.find((s) => s.id === (initialSubnet?.addressSpaceId ?? target?.id)) ?? project.addressSpaces[0]
  const [spaceId, setSpaceId] = useState(() => initialSpace?.id ?? crypto.randomUUID())
  const [parent, setParent] = useState(() => initialSpace?.parentCidr ?? '192.168.10.0/24')
  const [scope, setScope] = useState(() => initialSpace?.scope ?? 'Main site')
  const [spaceName, setSpaceName] = useState(() => initialSpace?.name ?? 'Primary address space')
  const [rows, setRows] = useState<DraftRequirement[]>(() => initialSpace ? project.subnets.filter((subnet) => subnet.addressSpaceId === initialSpace.id && subnet.status === 'allocated').map((subnet) => ({ id: subnet.id, name: subnet.name, hosts: String(subnet.hostRequirement) })) : exampleRows())
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [failures, setFailures] = useState<string[]>([])
  const [editing, setEditing] = useState<Subnet | null>(initialSubnet ?? null)
  const [dirty, setDirty] = useState(false)
  const committed = project.addressSpaces.find((s) => s.id === spaceId)
  const subnets = project.subnets.filter((s) => s.addressSpaceId === spaceId)
  const free = committed ? freeSpace(committed.parentCidr, subnets.map((s) => s.cidr)) : []
  const freeCount = free.reduce((sum, cidr) => sum + parseNetwork(cidr).size, 0)
  const total = committed ? parseNetwork(committed.parentCidr).size : 0
  const fixedIds = new Set(subnets.filter((s) => s.source === 'manual' || s.status === 'reserved').map((s) => s.id))

  function readSpace(): AddressSpace {
    return addressSpaceSchema.parse({ id: spaceId, name: spaceName, parentCidr: parseNetwork(parent).cidr, scope })
  }

  function updateRow(id: string, values: Partial<DraftRequirement>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...values } : row))
    setDirty(true)
    setFeedback('')
  }

  function generate(event: FormEvent) {
    event.preventDefault()
    try {
      const requirements = z.array(requirementSchema).min(1, 'Add at least one segment to allocate.')
        .parse(rows.filter((r) => !fixedIds.has(r.id)).map((r) => ({ ...r, hosts: Number(r.hosts) })))
      const space = readSpace()
      const result = generatePlan(project, space, requirements)
      replaceProject(result.project)
      setParent(space.parentCidr)
      setScope(space.scope)
      setFailures(result.failures.map((f) => f.message))
      setFeedback(`${result.allocated.length} automatic subnet${result.allocated.length === 1 ? '' : 's'} allocated. ${fixedIds.size} fixed block${fixedIds.size === 1 ? '' : 's'} preserved.`)
      setError('')
      setEditing(null)
      setDirty(false)
    } catch (cause) { setError(message(cause)); setFeedback('') }
  }

  function applyParent() {
    try {
      const space = readSpace()
      replaceProject(applyPlan(project, space, subnets))
      setParent(space.parentCidr)
      setScope(space.scope)
      setError('')
      setFeedback('Parent block applied. Existing subnets revalidated.')
      setFailures([])
    } catch (cause) { setError(message(cause)); setFeedback('') }
  }

  function startReserved() {
    try {
      const space = readSpace()
      setEditing({ id: crypto.randomUUID(), addressSpaceId: space.id, name: 'Reserved range',
        cidr: free[0] ?? space.parentCidr, status: 'reserved', hostRequirement: 0,
        gatewayIp: null, vlanId: null, source: 'manual', notes: '' })
      setError('')
    } catch (cause) { setError(message(cause)) }
  }

  function saveSubnet(subnet: Subnet) {
    const space = readSpace()
    const next = subnets.some((s) => s.id === subnet.id)
      ? subnets.map((s) => s.id === subnet.id ? subnet : s) : [...subnets, subnet]
    replaceProject(applyPlan(project, space, next))
    setParent(space.parentCidr)
    setScope(space.scope)
    setRows((current) => current.map((r) => r.id === subnet.id ? { ...r, name: subnet.name, hosts: String(subnet.hostRequirement) } : r))
    setEditing(null)
    setError('')
    setFailures([])
    setFeedback(`${subnet.name} applied. All subnet ranges revalidated.`)
  }

  function removeSubnet(subnet: Subnet) {
    if (!window.confirm(`Remove ${subnet.name} (${subnet.cidr}) from this plan?`)) return
    replaceProject(applyPlan(project, committed!, subnets.filter((s) => s.id !== subnet.id)))
    setRows((current) => current.filter((r) => r.id !== subnet.id))
    if (editing?.id === subnet.id) setEditing(null)
    setFailures([])
    setFeedback(`${subnet.name} removed. Its address range is now free.`)
  }

  return <div className="workspace-grid">
    <div className="work-area">
      <header className="page-heading">
        <p className="section-index">IPv4 / Allocate</p>
        <h1>Subnet planner</h1>
        <p>Allocate the largest networks first. Keep room for what comes next.</p>
      </header>
      <div className="flex flex-wrap gap-2 mb-4"><button type="button" onClick={() => {
        if ((dirty || editing || committed && (parent !== committed.parentCidr || scope !== committed.scope || spaceName !== committed.name)) && !window.confirm('Discard pending planner edits and create another address space?')) return
        setSpaceId(crypto.randomUUID()); setSpaceName('New address space'); setParent('10.0.0.0/24'); setScope('Main site'); setRows([]); setEditing(null); setDirty(false); setError(''); setFeedback('Apply the parent block to add this address space.'); setFailures([])
      }}>New address space</button>{committed && <button type="button" onClick={() => {
        if (!window.confirm(`Delete ${committed.name} and its ${subnets.length} subnets? Attached writing will be kept. You can undo this change during this session.`)) return
        const next = deleteAddressSpace(project, committed.id); replaceProject(next)
        const first = next.addressSpaces[0]
        setSpaceId(first?.id ?? crypto.randomUUID()); setSpaceName(first?.name ?? 'Primary address space'); setParent(first?.parentCidr ?? '192.168.10.0/24'); setScope(first?.scope ?? 'Main site')
        setRows(next.subnets.filter((s) => s.addressSpaceId === first?.id && s.status === 'allocated').map((s) => ({ id: s.id, name: s.name, hosts: String(s.hostRequirement) }))); setEditing(null); setDirty(false); setError(''); setFailures([]); setFeedback('Address space deleted. Related notes and tasks were preserved.')
      }}>Delete address space</button>}</div>
      {(project.addressSpaces.length > 1 || !committed && project.addressSpaces.length > 0) && <div className="field"><label htmlFor="edit-address-space">Edit address space</label><select id="edit-address-space" value={spaceId} onChange={(event) => {
        const space = project.addressSpaces.find((entry) => entry.id === event.target.value)!
        if ((dirty || editing || committed && (parent !== committed.parentCidr || scope !== committed.scope || spaceName !== committed.name)) && !window.confirm('Discard pending planner edits and switch address spaces?')) return
        setSpaceId(space.id); setParent(space.parentCidr); setScope(space.scope); setSpaceName(space.name)
        setRows(project.subnets.filter((subnet) => subnet.addressSpaceId === space.id && subnet.status === 'allocated').map((subnet) => ({ id: subnet.id, name: subnet.name, hosts: String(subnet.hostRequirement) })))
        setDirty(false); setEditing(null); setError(''); setFeedback(''); setFailures([])
      }}>{!committed && <option value={spaceId}>New address space (pending)</option>}{project.addressSpaces.map((space) => <option key={space.id} value={space.id}>{space.name} ({space.parentCidr}, {space.scope})</option>)}</select></div>}
      <form onSubmit={generate} noValidate>
        <section className="panel" aria-labelledby="parent-title">
          <h2 id="parent-title">Parent address space</h2>
          <div className="field mt-4"><label htmlFor="address-space-name">Address space name</label><input id="address-space-name" value={spaceName} onChange={(e) => { setSpaceName(e.target.value); setFeedback('') }} /></div>
          <div className="parent-fields mt-4">
            <div><label htmlFor="parent-cidr">Parent block</label><input id="parent-cidr" className="address mt-2" value={parent} onChange={(e) => { setParent(e.target.value); setFeedback('') }} spellCheck={false} /></div>
            <div><label htmlFor="scope">Routing scope</label><input id="scope" className="mt-2" value={scope} onChange={(e) => { setScope(e.target.value); setFeedback('') }} /></div>
            <button type="button" onClick={applyParent}>Apply parent</button>
          </div>
          <p className="help mt-3">Use an aligned network address. Ranges within this scope must not overlap.</p>
          {committed && (parent !== committed.parentCidr || scope !== committed.scope || spaceName !== committed.name) && <p className="notice mt-3">Parent changes are pending. The table and free space still show the applied plan.</p>}
        </section>
        <section className="panel" aria-labelledby="requirements-title">
          <div className="section-heading"><h2 id="requirements-title">Segment requirements</h2><button type="button" onClick={() => { setRows((current) => [...current, { id: crypto.randomUUID(), name: '', hosts: '' }]); setDirty(true); setFeedback('') }}>Add segment</button></div>
          <p className="help mb-4">Usable addresses include the gateway. {committed ? 'Rows reflect the applied plan; manual subnets stay fixed.' : 'The starting rows use your office example.'}</p>
          <div className="requirements-list">
            {rows.length === 0 && <p className="empty-state">No requirements. Add a segment, or reserve a range below.</p>}
            {rows.map((row, index) => <div className="requirement-row" key={row.id}>
              <span className="row-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div><label htmlFor={`name-${row.id}`}>Segment {index + 1}</label><input id={`name-${row.id}`} value={row.name} disabled={fixedIds.has(row.id)} onChange={(e) => updateRow(row.id, { name: e.target.value })} /></div>
              <div><label htmlFor={`hosts-${row.id}`}>Usable addresses {index + 1}</label><input id={`hosts-${row.id}`} type="number" min="1" max="4294967294" step="1" value={row.hosts} disabled={fixedIds.has(row.id)} onChange={(e) => updateRow(row.id, { hosts: e.target.value })} /></div>
              {fixedIds.has(row.id) ? <span className="help fixed-label">Fixed in plan</span> : <button type="button" className="text-button" aria-label={`Remove requirement ${index + 1}`} onClick={() => { setRows((current) => current.filter((r) => r.id !== row.id)); setDirty(true); setFeedback('') }}>Remove</button>}
            </div>)}
          </div>
          <div className="generate-actions"><button className="primary" type="submit">Generate subnets</button><span className="help">Replaces automatic allocations. Manual and reserved ranges stay fixed.</span></div>
          {dirty && <p className="notice mt-4">Requirements changed. Generate subnets to apply them.</p>}
          {error && <p role="alert" className="error mt-4">{error}</p>}
          {feedback && <p role="status" className="notice mt-4">{feedback}</p>}
          {failures.length > 0 && <div role="alert" className="error mt-4"><strong>Part of the request could not fit.</strong><ul>{failures.map((failure, index) => <li key={index}>{failure}</li>)}</ul><p>The subnets that fit are listed below. Increase the parent block or reduce requirements and generate again.</p></div>}
        </section>
      </form>
      <section className="panel" aria-labelledby="subnets-title">
        <div className="section-heading"><h2 id="subnets-title">Allocated &amp; reserved</h2><button type="button" onClick={startReserved}>Reserve range</button></div>
        {!subnets.length ? <p className="empty-state">No subnets yet. Generate from your requirements, or set aside a reserved range.</p> :
          <div className="table-scroll" role="region" aria-label="Subnet allocation table" tabIndex={0}>
            <table><thead><tr><th scope="col">Segment</th><th scope="col">Network / prefix</th><th scope="col">Usable / needed</th><th scope="col">Gateway</th><th scope="col">Status / source</th><th scope="col">Actions</th></tr></thead>
              <tbody>{[...subnets].sort((a, b) => parseNetwork(a.cidr).start - parseNetwork(b.cidr).start).map((subnet) => <tr key={subnet.id}>
                <th scope="row">{subnet.name}</th><td className="address">{subnet.cidr}</td>
                <td className="address">{parseNetwork(subnet.cidr).usableHosts.toLocaleString()} / {subnet.hostRequirement.toLocaleString()}</td>
                <td className="address">{subnet.gatewayIp ?? 'None'}</td><td>{subnet.status}<span className="cell-secondary">{subnet.source === 'manual' ? 'Manual (fixed)' : 'Automatic'}</span></td>
                <td><div className="flex gap-1"><button type="button" className="text-button" aria-label={`Edit ${subnet.name}`} onClick={() => setEditing(subnet)}>Edit</button><button type="button" className="text-button" aria-label={`Delete ${subnet.name}`} onClick={() => removeSubnet(subnet)}>Delete</button></div></td>
              </tr>)}</tbody>
            </table>
          </div>}
      </section>
      <section className="panel free-space" aria-labelledby="free-title">
        <div className="section-heading"><h2 id="free-title">Unused address space</h2>{committed && <span className="address">{freeCount.toLocaleString()} / {total.toLocaleString()} addresses free</span>}</div>
        {!committed ? <p className="empty-state">Apply a parent block or generate subnets to inspect free space.</p> : <>
          <meter min="0" max={total} value={total - freeCount} aria-label="Addresses allocated or reserved">{total - freeCount} of {total} addresses occupied</meter>
          {free.length ? <ul className="free-list">{free.map((cidr) => <li key={cidr}><code>{cidr}</code><span>{parseNetwork(cidr).size.toLocaleString()} addresses</span></li>)}</ul>
            : <p className="notice mt-4">No unused addresses remain in this parent block.</p>}
          <p className="help mt-3">Free space counts all addresses. Usable host capacity depends on how you divide these blocks.</p>
        </>}
      </section>
    </div>
    <aside className="inspector" aria-label="Planner inspector">
      {editing ? <SubnetEditor key={editing.id} subnet={editing} onSave={saveSubnet} onCancel={() => setEditing(null)} /> : <>
        <h2>Allocation rules</h2>
        <p>Each segment gets the smallest aligned block that meets its usable-address requirement.</p>
        <ol className="reference-list"><li>Sort requirements from largest to smallest.</li><li>Allocate from the lowest free address.</li><li>Use the first usable address as the gateway.</li></ol>
        <p className="help">A requirement of 2 uses /31 for a point-to-point link. A requirement of 1 uses /32.</p>
        <hr />
        <h3>Manual changes</h3><p>Select Edit on a subnet to adjust its CIDR, gateway, requirement, or status. Overlaps and out-of-range addresses are rejected.</p>
        <p className="help">Each address space has a routing scope. Use separate scopes when the same address ranges serve independent networks. Assign subnet VLANs in the subnet inspector or Logical workspace.</p>
      </>}
    </aside>
  </div>
}
