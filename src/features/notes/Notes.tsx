import { useRef, useState } from 'react'
import type { Note, ChecklistItem, Project } from '../../core/schema'
import { attachmentKey, attachmentLabel, getAttachmentTargets, type Attachment } from '../../core/notes'
import { useProjectStore } from '../../state/projectStore'
import { EditorForm, errorMessage } from '../topology/forms'
import './notes.css'

type Editor = { kind: 'note'; note?: Note } | { kind: 'task'; task?: ChecklistItem }
const statuses = { todo: 'To do', doing: 'Doing', done: 'Done' } as const

function EntryEditor({ editor, project, initialAttachment, onDone, onCancel }: {
  editor: Editor; project: Project; initialAttachment: Attachment; onDone: () => void; onCancel: () => void
}) {
  const entry = editor.kind === 'note' ? editor.note : editor.task
  const [text, setText] = useState(editor.kind === 'note' ? editor.note?.text ?? '' : editor.task?.task ?? '')
  const [status, setStatus] = useState<ChecklistItem['status']>(editor.kind === 'task' ? editor.task?.status ?? 'todo' : 'todo')
  const [attachedTo, setAttachedTo] = useState(entry ? entry.attachedTo : initialAttachment)
  const targets = getAttachmentTargets(project).filter((target) => target.attachment.id !== entry?.id)
  const addNote = useProjectStore((s) => s.addNote)
  const updateNote = useProjectStore((s) => s.updateNote)
  const addTask = useProjectStore((s) => s.addChecklistItem)
  const updateTask = useProjectStore((s) => s.updateChecklistItem)
  const missing = attachedTo && !targets.some((target) => attachmentKey(target.attachment) === attachmentKey(attachedTo))

  return <section className="panel notes-editor" aria-labelledby="entry-editor-title">
    <h2 id="entry-editor-title">{entry ? 'Edit' : 'New'} {editor.kind}</h2>
    <EditorForm submitLabel={`${entry ? 'Apply' : 'Save'} ${editor.kind}`} onCancel={onCancel} onSubmit={() => {
      if (editor.kind === 'note') {
        if (editor.note) updateNote(editor.note.id, { text, attachedTo })
        else addNote({ text, attachedTo })
      } else {
        if (editor.task) updateTask(editor.task.id, { task: text, status, attachedTo })
        else addTask({ task: text, status, attachedTo })
      }
      onDone()
    }}>
      <div className="field"><label htmlFor="entry-text">{editor.kind === 'note' ? 'Note text' : 'Task'}</label>
        {editor.kind === 'note' ? <textarea id="entry-text" rows={5} autoFocus required value={text} onChange={(event) => setText(event.target.value)} /> : <input id="entry-text" autoFocus required value={text} onChange={(event) => setText(event.target.value)} />}
      </div>
      <div className="notes-editor-fields">
        <div className="field"><label htmlFor="entry-attachment">Attach to</label><select id="entry-attachment" value={attachmentKey(attachedTo)} onChange={(event) => setAttachedTo(targets.find((target) => attachmentKey(target.attachment) === event.target.value)?.attachment)}>
          <option value="">Unattached</option>
          {missing && <option value={attachmentKey(attachedTo)}>Missing attachment; choose another</option>}
          {targets.map((target) => <option key={attachmentKey(target.attachment)} value={attachmentKey(target.attachment)}>{target.label}</option>)}
        </select></div>
        {editor.kind === 'task' && <div className="field"><label htmlFor="entry-status">Task status</label><select id="entry-status" value={status} onChange={(event) => setStatus(event.target.value as ChecklistItem['status'])}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
      </div>
      <p className="help mb-4">Deleting an attachment target preserves this {editor.kind} as unattached project content.</p>
    </EditorForm>
  </section>
}

export function Notes() {
  const project = useProjectStore((s) => s.project)
  const removeNote = useProjectStore((s) => s.deleteNote)
  const removeTask = useProjectStore((s) => s.deleteChecklistItem)
  const setStatus = useProjectStore((s) => s.setChecklistStatus)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [search, setSearch] = useState('')
  const [attachmentFilter, setAttachmentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const trigger = useRef<HTMLButtonElement | null>(null)
  const addNoteButton = useRef<HTMLButtonElement | null>(null)
  const addTaskButton = useRef<HTMLButtonElement | null>(null)
  const taskStatusFilter = useRef<HTMLSelectElement | null>(null)
  const targets = getAttachmentTargets(project)
  const query = search.trim().toLocaleLowerCase()
  const projectTarget: Attachment = { entityType: 'project', id: project.id }
  const initialAttachment = targets.find((target) => attachmentKey(target.attachment) === attachmentFilter)?.attachment ?? projectTarget
  const matches = (entry: { attachedTo?: Attachment }, text: string) => {
    const attached = attachmentFilter === 'all' || (attachmentFilter === 'project' ? !entry.attachedTo || entry.attachedTo.entityType === 'project' : attachmentKey(entry.attachedTo) === attachmentFilter)
    return attached && `${text} ${attachmentLabel(project, entry.attachedTo)}`.toLocaleLowerCase().includes(query)
  }
  const notes = project.notes.filter((entry) => matches(entry, entry.text))
  const tasks = project.checklistItems.filter((entry) => matches(entry, entry.task) && (statusFilter === 'all' || entry.status === statusFilter))

  function open(next: Editor, button: HTMLButtonElement) {
    trigger.current = button
    setEditor(next)
    setFeedback('')
    setError('')
  }

  function close(message = '') {
    const button = trigger.current
    const fallback = editor?.kind === 'task' ? addTaskButton.current : addNoteButton.current
    setEditor(null)
    setFeedback(message)
    requestAnimationFrame(() => { if (button?.isConnected) button.focus(); else fallback?.focus() })
  }

  function remove(kind: 'note' | 'task', id: string) {
    if (!window.confirm(`Delete this ${kind}? Related notes and tasks will remain unattached. This cannot be undone in this session.`)) return
    try {
      if (kind === 'note') removeNote(id)
      else removeTask(id)
      setEditor(null)
      setError('')
      setFeedback(`${kind === 'note' ? 'Note' : 'Task'} deleted.`)
      if (kind === 'note') addNoteButton.current?.focus()
      else addTaskButton.current?.focus()
    } catch (cause) { setFeedback(''); setError(errorMessage(cause)) }
  }

  return <div className="work-area notes-workspace">
    <header className="page-heading"><p className="section-index">06 / Implementation</p><h1>Notes and checklist</h1><p>Record network decisions and track implementation tasks alongside the plan.</p></header>
    {feedback && <p role="status" className="notice mb-4">{feedback}</p>}
    {error && <p role="alert" className="error mb-4">{error}</p>}
    {editor && <EntryEditor key={`${editor.kind}:${editor.kind === 'note' ? editor.note?.id ?? 'new' : editor.task?.id ?? 'new'}`} editor={editor} project={project} initialAttachment={initialAttachment} onCancel={() => close()} onDone={() => {
      const editing = editor.kind === 'note' ? editor.note : editor.task
      close(`${editor.kind === 'note' ? 'Note' : 'Task'} ${editing ? 'updated' : 'added'}.`)
    }} />}
    <section className="panel" aria-label="Find notes and tasks">
      <div className="notes-filters">
        <div className="field"><label htmlFor="notes-search">Search notes and tasks</label><input id="notes-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="field"><label htmlFor="notes-attachment-filter">Show attachments</label><select id="notes-attachment-filter" value={attachmentFilter} onChange={(event) => setAttachmentFilter(event.target.value)}>
          <option value="all">All attachments</option><option value="project">Whole project and unattached</option>
          {!['all', 'project'].includes(attachmentFilter) && !targets.some((target) => attachmentKey(target.attachment) === attachmentFilter) && <option value={attachmentFilter}>Deleted target; choose another</option>}
          {targets.filter((target) => target.attachment.entityType !== 'project').map((target) => <option key={attachmentKey(target.attachment)} value={attachmentKey(target.attachment)}>{target.label}</option>)}
        </select></div>
        <button type="button" onClick={() => { setSearch(''); setAttachmentFilter('all'); setStatusFilter('all') }}>Clear filters</button>
      </div>
    </section>
    <section className="panel" aria-labelledby="notes-title">
      <div className="section-heading"><h2 id="notes-title">Notes ({notes.length})</h2><button ref={addNoteButton} type="button" className="primary" onClick={(event) => open({ kind: 'note' }, event.currentTarget)}>Add note</button></div>
      {!notes.length ? <p className="empty-state">{project.notes.length ? 'No notes match these filters. Clear filters to see all notes.' : 'No notes yet. Add a note to record decisions for this project or an item in the plan.'}</p> : <ul className="notes-list">{notes.map((note, index) => <li key={note.id}>
        <div className="notes-entry-heading"><h3>Note {index + 1}</h3><div className="notes-actions"><button type="button" aria-label={`Edit note ${index + 1}`} onClick={(event) => open({ kind: 'note', note }, event.currentTarget)}>Edit</button><button type="button" aria-label={`Delete note ${index + 1}`} onClick={() => remove('note', note.id)}>Delete</button></div></div>
        <p className="notes-context">{attachmentLabel(project, note.attachedTo)}</p><p className="note-content">{note.text}</p>
      </li>)}</ul>}
    </section>
    <section className="panel" aria-labelledby="checklist-title">
      <div className="section-heading"><h2 id="checklist-title">Implementation checklist ({tasks.length})</h2><button ref={addTaskButton} type="button" onClick={(event) => open({ kind: 'task' }, event.currentTarget)}>Add task</button></div>
      <div className="field notes-status-filter"><label htmlFor="checklist-filter">Show task status</label><select ref={taskStatusFilter} id="checklist-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <p className="help">{project.checklistItems.filter((item) => item.status === 'done').length} of {project.checklistItems.length} project tasks done.</p>
      {!tasks.length ? <p className="empty-state">{project.checklistItems.length ? 'No tasks match these filters. Clear filters to see all tasks.' : 'No implementation tasks yet. Add a task and choose To do, Doing, or Done.'}</p> : <ul className="notes-list checklist-list">{tasks.map((task, index) => <li key={task.id}>
        <div className="checklist-description"><h3>{task.task}</h3><p className="notes-context">{attachmentLabel(project, task.attachedTo)}</p></div>
        <div className="field checklist-status"><label htmlFor={`task-status-${task.id}`}>Status for task {index + 1}</label><select id={`task-status-${task.id}`} value={task.status} onChange={(event) => {
          try {
            const nextStatus = event.target.value as ChecklistItem['status']
            setStatus(task.id, nextStatus); setError(''); setFeedback(`Task status changed to ${statuses[nextStatus]}.`)
            if (statusFilter !== 'all' && statusFilter !== nextStatus) requestAnimationFrame(() => taskStatusFilter.current?.focus())
          }
          catch (cause) { setFeedback(''); setError(errorMessage(cause)) }
        }}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="notes-actions"><button type="button" aria-label={`Edit task ${index + 1}`} onClick={(event) => open({ kind: 'task', task }, event.currentTarget)}>Edit</button><button type="button" aria-label={`Delete task ${index + 1}`} onClick={() => remove('task', task.id)}>Delete</button></div>
      </li>)}</ul>}
    </section>
  </div>
}
