import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { parseNetwork } from '../../core/cidr'
import { subnetSchema, type Subnet } from '../../core/schema'

export function SubnetEditor({ subnet, onSave, onCancel }: {
  subnet: Subnet; onSave: (subnet: Subnet) => void; onCancel: () => void
}) {
  const [name, setName] = useState(subnet.name)
  const [cidr, setCidr] = useState(subnet.cidr)
  const [hosts, setHosts] = useState(String(subnet.hostRequirement))
  const [gateway, setGateway] = useState(subnet.gatewayIp ?? '')
  const [status, setStatus] = useState(subnet.status)
  const [error, setError] = useState('')

  function save(event: FormEvent) {
    event.preventDefault()
    try {
      const next = subnetSchema.parse({ ...subnet, name, cidr: parseNetwork(cidr).cidr,
        hostRequirement: status === 'reserved' ? 0 : Number(hosts), status,
        gatewayIp: gateway.trim() || null, source: 'manual' })
      onSave(next)
    } catch (cause) {
      setError(cause instanceof z.ZodError ? cause.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n') : (cause as Error).message)
    }
  }

  return <form onSubmit={save} noValidate onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}>
    <h2>Subnet inspector</h2>
    <p className="help mt-2 mb-5">Manual blocks stay fixed when you generate a plan again.</p>
    <div className="field"><label htmlFor="subnet-name">Subnet name</label><input id="subnet-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
    <div className="field"><label htmlFor="subnet-cidr">Subnet CIDR</label><input id="subnet-cidr" className="address" value={cidr} onChange={(e) => setCidr(e.target.value)} spellCheck={false} /></div>
    <div className="field"><label htmlFor="subnet-status">Status</label><select id="subnet-status" value={status} onChange={(e) => setStatus(e.target.value as Subnet['status'])}>
      <option value="allocated">Allocated</option><option value="reserved">Reserved</option>
    </select></div>
    {status === 'allocated' && <div className="field"><label htmlFor="subnet-hosts">Required usable addresses</label><input id="subnet-hosts" type="number" min="1" step="1" value={hosts} onChange={(e) => setHosts(e.target.value)} /></div>}
    <div className="field"><label htmlFor="subnet-gateway">Gateway (optional)</label><input id="subnet-gateway" className="address" value={gateway} onChange={(e) => setGateway(e.target.value)} spellCheck={false} />
      <button type="button" className="text-button" onClick={() => {
        try { setGateway(parseNetwork(cidr).firstUsable); setError('') } catch (cause) { setError((cause as Error).message) }
      }}>Use first usable address</button>
    </div>
    {error && <p className="error mb-4" role="alert">{error}</p>}
    <div className="flex flex-wrap gap-2"><button type="submit" className="primary">Apply subnet</button><button type="button" onClick={onCancel}>Cancel</button></div>
  </form>
}
