import { useRef, useState, type ChangeEvent } from 'react'
import { createEmptyProject, type Project } from '../../core/schema'
import { documentError, parseProjectJson, projectFilename, serializeProject } from '../../core/document'
import { useProjectStore } from '../../state/projectStore'
import { useTopologyUiStore } from '../../state/topologyUiStore'
import { localProject, usePersistenceStore } from '../../state/persistenceStore'
import { downloadText } from '../../storage/download'
import { Report } from './Report'
import './files.css'

export function Files() {
  const project = useProjectStore((s) => s.project)
  const replace = useProjectStore((s) => s.openProject)
  const save = usePersistenceStore()
  const [draft, setDraft] = useState('')
  const [candidate, setCandidate] = useState<Project | null>(null)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [reading, setReading] = useState(false)
  const [tiled, setTiled] = useState(false)
  const fileRequest = useRef(0)

  function validate(text: string) {
    try { const next = parseProjectJson(text); setCandidate(next); setError(''); setFeedback('JSON is valid. Review the project below before importing.'); return next }
    catch (cause) { setCandidate(null); setFeedback(''); setError(documentError(cause)); return null }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const request = ++fileRequest.current
    setReading(true); setError(''); setFeedback(''); setCandidate(null)
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Choose a JSON project file smaller than 20 MiB.')
      const text = await file.text()
      if (request !== fileRequest.current) return
      setDraft(text); validate(text)
    } catch (cause) { if (request === fileRequest.current) setError(documentError(cause)) }
    finally { if (request === fileRequest.current) setReading(false); event.target.value = '' }
  }

  function importProject() {
    const next = validate(draft)
    if (!next || !window.confirm(`Replace ${project.name} with ${next.name}? Export the current project first if you need to keep it.`)) return
    replace(next)
    useTopologyUiStore.getState().select(null)
    setCandidate(null); setFeedback(`Imported ${next.name}.`)
  }

  return <div className="work-area files-workspace">
    <div className="file-controls">
      <header className="page-heading"><p className="section-index">07 / Project files</p><h1>Files and report</h1><p>Save a portable JSON copy, import a project, or print a report with the current plan.</p></header>
      <section className="panel" aria-labelledby="browser-save-title">
        <h2 id="browser-save-title">Browser save</h2><p className={save.status === 'saved' ? 'notice mt-3' : 'error mt-3'} role={save.status === 'saved' ? 'status' : 'alert'}>{save.message}</p>
        <div className="file-actions">
          {save.status === 'error' && !save.paused && <button type="button" onClick={() => localProject.save(project)}>Retry saving</button>}
          {save.paused && <button type="button" onClick={() => { if (window.confirm('Keep the open project and resume browser saving? An unreadable save will be retained as a recovery copy. A newer save from another tab will be replaced.')) localProject.resume(project) }}>Keep this project and save</button>}
          {save.status === 'conflict' && <button type="button" onClick={() => { if (window.confirm('Load the saved project and replace the work open in this tab? Export JSON first to keep that work.')) localProject.loadSaved() }}>Load saved project</button>}
          {save.recoveryRaw !== undefined && <button type="button" onClick={() => downloadText(save.recoveryRaw!, 'netscratch-unreadable-save.txt', 'text/plain')}>Download unreadable save</button>}
          <button type="button" onClick={() => {
            try { const backup = localProject.backup(); const text = serializeProject(backup); setDraft(text); validate(text) }
            catch (cause) { setError(documentError(cause)); setFeedback('') }
          }}>Review previous save</button>
        </div>
        <p className="help">Saving covers applied changes. Form drafts stay temporary. Browser storage is local to this browser profile and site address; clearing site data removes it.</p>
      </section>
      <section className="panel" aria-labelledby="json-files-title">
        <div className="section-heading"><h2 id="json-files-title">Project JSON</h2><button type="button" className="primary" onClick={() => {
          try { downloadText(serializeProject(project), projectFilename(project.name, 'json')); setError(''); setFeedback('Project JSON downloaded.') }
          catch (cause) { setError(documentError(cause)) }
        }}>Download project JSON</button></div>
        <div className="field"><label htmlFor="project-file">Open JSON file</label><input id="project-file" type="file" accept=".json,application/json" onChange={readFile} /><p className="help">Files up to 20 MiB. Opening a file fills the editor; the current project is replaced only after Import project.</p></div>
        {reading && <p role="status" className="notice">Reading project file...</p>}
        <div className="field"><label htmlFor="project-json">Editable project JSON</label><textarea id="project-json" rows={10} spellCheck={false} disabled={reading} value={draft} onChange={(event) => { fileRequest.current++; setDraft(event.target.value); setCandidate(null); setError(''); setFeedback('') }} /></div>
        <div className="file-actions"><button type="button" onClick={() => { setDraft(serializeProject(project)); setCandidate(null); setError(''); setFeedback('Current project loaded into the JSON editor.') }}>Load current JSON</button><button type="button" disabled={reading} onClick={() => validate(draft)}>Validate JSON</button><button type="button" disabled={reading} onClick={importProject}>Import project</button></div>
        {candidate && <div className="notice mt-4"><h3>Import preview: {candidate.name}</h3><p>Schema {candidate.schemaVersion}; {candidate.devices.length} devices, {candidate.subnets.length} subnets, {candidate.hardwareItems.length} hardware models, {candidate.notes.length} notes, {candidate.checklistItems.length} tasks.</p></div>}
        <div className="file-actions"><button type="button" onClick={() => {
          if (!window.confirm(`Start a new empty project? Export ${project.name} first if you need to keep it.`)) return
          replace(createEmptyProject()); useTopologyUiStore.getState().select(null); setFeedback('New empty project opened.'); setError(''); setCandidate(null)
        }}>New empty project</button></div>
      </section>
      {error && <p role="alert" className="error mb-4">{error}</p>}
      {feedback && <p role="status" className="notice mb-4">{feedback}</p>}
      <section className="panel" aria-labelledby="report-settings-title"><h2 id="report-settings-title">Print report</h2><p className="help">The preview below uses the committed project. Choose Save as PDF in your browser's print dialog to create a PDF with selectable text.</p>
        <div className="file-actions"><label className="checkbox-label"><input type="checkbox" checked={tiled} onChange={(event) => setTiled(event.target.checked)} />Enlarge diagrams across four pages each</label><button type="button" className="primary" onClick={() => window.print()}>Print / save PDF</button></div>
      </section>
    </div>
    <Report project={project} tiled={tiled} />
  </div>
}
