import { useEffect, useState, type FormEvent } from 'react'
import { Calculator } from './features/calculator/Calculator'
import { Planner } from './features/planner/Planner'
import { Topology } from './features/topology/Topology'
import { LogicalView } from './features/topology/LogicalView'
import { Inventory } from './features/inventory/Inventory'
import { Notes } from './features/notes/Notes'
import { Files } from './features/files/Files'
import { usePersistenceStore } from './state/persistenceStore'
import { useProjectStore } from './state/projectStore'

export function App() {
  const [page, setPage] = useState<'calculator' | 'planner' | 'topology' | 'logical' | 'inventory' | 'notes' | 'files'>('calculator')
  const [dark, setDark] = useState(false)
  const name = useProjectStore((s) => s.project.name)
  const epoch = useProjectStore((s) => s.documentEpoch)
  const renameProject = useProjectStore((s) => s.renameProject)
  const [draftName, setDraftName] = useState(name)
  const [nameError, setNameError] = useState('')
  const save = usePersistenceStore()
  useEffect(() => { setDraftName(name); setNameError('') }, [name])

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
      <div className="session-status">{save.status === 'saved' ? 'Saved in this browser' : 'Browser save needs attention'}<span>{save.status === 'saved' ? 'JSON backups in Files' : 'Open Files to review'}</span></div>
      <button type="button" onClick={() => setDark((value) => !value)} aria-label={dark ? 'Use light theme' : 'Use dark theme'}>{dark ? 'Light theme' : 'Dark theme'}</button>
    </header>
    <div className="app-body">
      <nav className="sidebar" aria-label="Workspace">
        <p className="nav-label">Plan your network</p>
        <button type="button" aria-current={page === 'calculator' ? 'page' : undefined} onClick={() => setPage('calculator')}><span>01</span>Calculator</button>
        <button type="button" aria-current={page === 'planner' ? 'page' : undefined} onClick={() => setPage('planner')}><span>02</span>Planner</button>
        <button type="button" aria-current={page === 'topology' ? 'page' : undefined} onClick={() => setPage('topology')}><span>03</span>Physical</button>
        <button type="button" aria-current={page === 'logical' ? 'page' : undefined} onClick={() => setPage('logical')}><span>04</span>Logical</button>
        <button type="button" aria-current={page === 'inventory' ? 'page' : undefined} onClick={() => setPage('inventory')}><span>05</span>Inventory</button>
        <button type="button" aria-current={page === 'notes' ? 'page' : undefined} onClick={() => setPage('notes')}><span>06</span>Notes</button>
        <button type="button" aria-current={page === 'files' ? 'page' : undefined} onClick={() => setPage('files')}><span>07</span>Files</button>
        <div className="later-phases"><p className="nav-label">Later phases</p><ul><li>Issues</li></ul></div>
        <p className="sidebar-note">Network planning and project files<span>Phase 4 of 6</span></p>
      </nav>
      <main id="main" tabIndex={-1}>
        <div className="session-notice" role={save.status === 'saved' ? undefined : 'alert'}>{save.message}{save.status !== 'saved' && <button type="button" className="text-button" onClick={() => setPage('files')}>Review browser save</button>}</div>
        <div hidden={page !== 'calculator'}><Calculator key={epoch} /></div>
        <div hidden={page !== 'planner'}><Planner key={epoch} /></div>
        {page === 'topology' && <Topology key={epoch} />}
        {page === 'logical' && <LogicalView key={epoch} />}
        {page === 'inventory' && <Inventory key={epoch} />}
        {page === 'notes' && <Notes key={epoch} />}
        {page === 'files' && <Files />}
      </main>
    </div>
  </div>
}
