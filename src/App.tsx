import { useEffect, useState, type FormEvent } from 'react'
import { Calculator } from './features/calculator/Calculator'
import { Planner } from './features/planner/Planner'
import { Topology } from './features/topology/Topology'
import { LogicalView } from './features/topology/LogicalView'
import { Inventory } from './features/inventory/Inventory'
import { Notes } from './features/notes/Notes'
import { Files } from './features/files/Files'
import { Issues } from './features/issues/Issues'
import type { EntityRef } from './core/issues'
import { useTopologyUiStore } from './state/topologyUiStore'
import { usePersistenceStore } from './state/persistenceStore'
import { useProjectStore } from './state/projectStore'

export function App() {
  const [page, setPage] = useState<'calculator' | 'planner' | 'topology' | 'logical' | 'inventory' | 'notes' | 'files' | 'issues'>('calculator')
  const [target, setTarget] = useState<EntityRef>()
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const canUndo = useProjectStore((s) => s.past.length > 0)
  const canRedo = useProjectStore((s) => s.future.length > 0)
  const [dark, setDark] = useState(false)
  const name = useProjectStore((s) => s.project.name)
  const epoch = useProjectStore((s) => s.documentEpoch)
  const renameProject = useProjectStore((s) => s.renameProject)
  const [draftName, setDraftName] = useState(name)
  const [nameError, setNameError] = useState('')
  const save = usePersistenceStore()
  useEffect(() => { setDraftName(name); setNameError('') }, [name, epoch])
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const element = event.target as HTMLElement
      if (element.closest('input,textarea,select,[contenteditable="true"]') || event.altKey || !(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [undo, redo])

  function inspect(entity: EntityRef) {
    setTarget(entity)
    if (['device', 'port', 'link'].includes(entity.entityType)) {
      useTopologyUiStore.getState().select({ kind: entity.entityType as 'device' | 'port' | 'link', id: entity.id }); setPage('topology')
    } else if (entity.entityType === 'vlan' || entity.entityType === 'interface') {
      useTopologyUiStore.getState().select({ kind: entity.entityType, id: entity.id }); setPage('logical')
    } else if (entity.entityType === 'subnet' || entity.entityType === 'addressSpace') setPage('planner')
    else if (entity.entityType === 'hardwareItem' || entity.entityType === 'allocation') setPage('inventory')
    else setPage('files')
    requestAnimationFrame(() => {
      const selector = entity.entityType === 'subnet' ? '#subnet-name' : entity.entityType === 'addressSpace' ? '#parent-cidr' : entity.entityType === 'hardwareItem' || entity.entityType === 'allocation' ? '.inventory-workspace form input, .inventory-workspace form select' : '.topology-inspector input'
      const element = document.querySelector<HTMLElement>(selector)
      if (element && element.getClientRects().length) element.focus()
      else document.getElementById('main')?.focus()
    })
  }

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
        <button type="button" aria-current={page === 'issues' ? 'page' : undefined} onClick={() => setPage('issues')}><span>08</span>Issues</button>
        <div className="history-controls" aria-label="Project history"><button type="button" disabled={!canUndo} onClick={undo}>Undo</button><button type="button" disabled={!canRedo} onClick={redo}>Redo</button></div>
        <p className="sidebar-note">Network planning and project files<span>50 changes of session history</span></p>
      </nav>
      <main id="main" tabIndex={-1}>
        <div className="session-notice" role={save.status === 'saved' ? undefined : 'alert'}>{save.message}{save.status !== 'saved' && <button type="button" className="text-button" onClick={() => setPage('files')}>Review browser save</button>}</div>
        <div hidden={page !== 'calculator'}><Calculator key={epoch} /></div>
        <div hidden={page !== 'planner'}><Planner key={`${epoch}:${target?.entityType}:${target?.id}`} target={target} /></div>
        {page === 'topology' && <Topology key={epoch} />}
        {page === 'logical' && <LogicalView key={epoch} />}
        {page === 'inventory' && <Inventory key={`${epoch}:${target?.id}`} target={target} />}
        {page === 'notes' && <Notes key={epoch} />}
        {page === 'files' && <Files />}
        {page === 'issues' && <Issues onInspect={inspect} />}
      </main>
    </div>
  </div>
}
