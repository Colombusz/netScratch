import { useState, type FormEvent } from 'react'
import { Calculator } from './features/calculator/Calculator'
import { Planner } from './features/planner/Planner'
import { Topology } from './features/topology/Topology'
import { LogicalView } from './features/topology/LogicalView'
import { useProjectStore } from './state/projectStore'

export function App() {
  const [page, setPage] = useState<'calculator' | 'planner' | 'topology' | 'logical'>('calculator')
  const [dark, setDark] = useState(false)
  const name = useProjectStore((s) => s.project.name)
  const renameProject = useProjectStore((s) => s.renameProject)
  const [draftName, setDraftName] = useState(name)
  const [nameError, setNameError] = useState('')

  function rename(event?: FormEvent) {
    event?.preventDefault()
    if (!draftName.trim()) { setNameError('Give the project a name.'); return }
    renameProject(draftName.trim())
    setDraftName(draftName.trim())
    setNameError('')
  }

  return <div className="app-shell" data-theme={dark ? 'dark' : 'light'}>
    <a className="skip-link" href="#main">Skip to workspace</a>
    <header className="topbar">
      <span className="wordmark">netScratch<span>Network workspace</span></span>
      <form className="project-name" onSubmit={rename}>
        <label htmlFor="project-name">Project name</label>
        <input id="project-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} onBlur={() => rename()} aria-invalid={Boolean(nameError)} aria-describedby="name-error" />
        {nameError && <p id="name-error" role="alert" className="error">{nameError}</p>}
      </form>
      <div className="session-status">Session only<span>Autosave arrives in Phase 4</span></div>
      <button type="button" onClick={() => setDark((value) => !value)} aria-label={dark ? 'Use light theme' : 'Use dark theme'}>{dark ? 'Light theme' : 'Dark theme'}</button>
    </header>
    <div className="app-body">
      <nav className="sidebar" aria-label="Workspace">
        <p className="nav-label">Plan your network</p>
        <button type="button" aria-current={page === 'calculator' ? 'page' : undefined} onClick={() => setPage('calculator')}><span>01</span>Calculator</button>
        <button type="button" aria-current={page === 'planner' ? 'page' : undefined} onClick={() => setPage('planner')}><span>02</span>Planner</button>
        <button type="button" aria-current={page === 'topology' ? 'page' : undefined} onClick={() => setPage('topology')}><span>03</span>Physical</button>
        <button type="button" aria-current={page === 'logical' ? 'page' : undefined} onClick={() => setPage('logical')}><span>04</span>Logical</button>
        <div className="later-phases"><p className="nav-label">Later phases</p><ul><li>Inventory</li><li>Notes</li><li>Issues</li><li>Export</li></ul></div>
        <p className="sidebar-note">Logical network planning<span>Phase 3 of 6</span></p>
      </nav>
      <main id="main" tabIndex={-1}>
        <div className="session-notice">This phase keeps your plan in memory. Reloading or closing this tab clears it.</div>
        <div hidden={page !== 'calculator'}><Calculator /></div>
        <div hidden={page !== 'planner'}><Planner /></div>
        {page === 'topology' && <Topology />}
        {page === 'logical' && <LogicalView />}
      </main>
    </div>
  </div>
}
