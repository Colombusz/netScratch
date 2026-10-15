import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { parseCidr, type Cidr } from '../../core/cidr'

const inputSchema = z.string().trim().min(1, 'Enter an IPv4 address with a prefix or mask.')

export function Calculator() {
  const [input, setInput] = useState('192.168.10.0/25')
  const [result, setResult] = useState<Cidr | null>(null)
  const [error, setError] = useState('')
  const [calculatedInput, setCalculatedInput] = useState('')

  function calculate(event: FormEvent) {
    event.preventDefault()
    try {
      setResult(parseCidr(inputSchema.parse(input)))
      setCalculatedInput(input)
      setError('')
    } catch (cause) {
      setResult(null)
      setError(cause instanceof z.ZodError ? cause.issues[0]!.message : (cause as Error).message)
    }
  }

  return <div className="workspace-grid">
    <div className="work-area">
      <header className="page-heading">
        <p className="section-index">IPv4 / Calculate</p>
        <h1>Subnet calculator</h1>
        <p>Find the boundaries and usable addresses of an IPv4 network.</p>
      </header>
      <form className="panel" onSubmit={calculate} noValidate>
        <label htmlFor="calculator-input">IPv4 address and prefix or mask</label>
        <div className="input-action mt-2">
          <input id="calculator-input" className="address" value={input} onChange={(e) => setInput(e.target.value)}
            aria-invalid={Boolean(error)} aria-describedby="calculator-format calculator-error" autoComplete="off" spellCheck={false} />
          <button className="primary" type="submit">Calculate</button>
        </div>
        <p id="calculator-format" className="help mt-3">Accepts 192.168.10.1/24, 192.168.10.1/255.255.255.0, or an address followed by a space and mask.</p>
        <div id="calculator-error" role="alert">{error && <p className="error mt-4">{error}</p>}</div>
      </form>
      <section className="panel result-panel" aria-labelledby="calculation-title" aria-live="polite">
        <h2 id="calculation-title">Network details</h2>
        {!result ? <p className="empty-state">Enter an address and calculate to see its network details.</p> : <>
          {input !== calculatedInput && <p className="notice mt-4">Input changed. Calculate again to update these results.</p>}
          <div className="network-result">
            <span className="help">Network block</span>
            <strong className="address">{result.cidr}</strong>
            <span>{result.usableHosts.toLocaleString()} usable {result.usableHosts === 1 ? 'address' : 'addresses'}</span>
          </div>
          <dl className="detail-list">
            {[
              ['Subnet mask', result.mask], ['Network address', result.network],
              ['Broadcast address', result.broadcast], ['First usable host', result.firstUsable],
              ['Last usable host', result.lastUsable], ['Total addresses', result.size.toLocaleString()],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="address">{value}</dd></div>)}
          </dl>
          {result.prefix >= 31 && <p className="notice mt-4">{result.prefix === 31
            ? '/31 is a point-to-point block: both addresses are usable. The upper address is shown in the broadcast field for reference; it is not reserved for broadcast.'
            : '/32 represents a single host: its only address is usable. Network and broadcast fields show the same address.'}</p>}
        </>}
      </section>
    </div>
    <aside className="inspector" aria-label="Calculator reference">
      <h2>Address rules</h2>
      <p>Host requirements count usable addresses, including the gateway.</p>
      <dl className="reference-list">
        <div><dt>/0 through /30</dt><dd>Total addresses minus network and broadcast.</dd></div>
        <div><dt>/31</dt><dd>Two usable addresses for a point-to-point link.</dd></div>
        <div><dt>/32</dt><dd>One usable address for a single host.</dd></div>
      </dl>
      <p className="help">The calculator accepts host addresses and finds their network. The planner requires an aligned network address.</p>
    </aside>
  </div>
}
