import { useMemo, useState } from 'react'
import { collectIssues, type EntityRef } from '../../core/issues'
import { attachmentLabel } from '../../core/notes'
import { useProjectStore } from '../../state/projectStore'
import './issues.css'

export function Issues({ onInspect }: { onInspect: (entity: EntityRef) => void }) {
  const project = useProjectStore((state) => state.project)
  const issues = useMemo(() => collectIssues(project), [project])
  const [severity, setSeverity] = useState('all')
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const shown = issues.filter((issue) => (severity === 'all' || issue.severity === severity) && (category === 'all' || issue.category === category) && `${issue.message} ${issue.code} ${issue.entities.map((e) => attachmentLabel(project, e)).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()))
  const errors = issues.filter((issue) => issue.severity === 'error').length
  return <div className="work-area issues-workspace">
    <header className="page-heading"><p className="section-index">08 / Review</p><h1>Project issues</h1><p>Check addressing, cables, VLANs, and hardware. Open an affected item to repair the plan.</p></header>
    <p className="notice" role="status">{errors} errors · {issues.length - errors} warnings. Checks update as you apply changes.</p>
    <div className="issue-filters">
      <div className="field"><label htmlFor="issue-search">Search issues</label><input id="issue-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="field"><label htmlFor="issue-severity">Severity</label><select id="issue-severity" value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="all">All severities</option><option value="error">Errors</option><option value="warning">Warnings</option></select></div>
      <div className="field"><label htmlFor="issue-category">Category</label><select id="issue-category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">All categories</option>{['Addressing', 'Topology', 'VLANs', 'Hardware', 'Document'].map((value) => <option key={value}>{value}</option>)}</select></div>
    </div>
    {!shown.length ? <p className="empty-state">{issues.length ? 'No issues match these filters.' : 'No issues found by the current checks. Review the plan against your equipment and deployment requirements.'}</p> : <ol className="issue-list">{shown.map((issue) => <li key={issue.id}>
      <p className={issue.severity === 'error' ? 'issue-error' : 'help'}><strong>{issue.severity === 'error' ? 'Error' : 'Warning'}</strong> / {issue.category} / {issue.code}</p>
      <h2>{issue.message}</h2><p>{issue.repair}</p>
      <div className="issue-targets">{issue.entities.map((entity) => <button type="button" key={`${entity.entityType}:${entity.id}`} onClick={() => onInspect(entity)}>Open {attachmentLabel(project, entity)}</button>)}</div>
    </li>)}</ol>}
    <p className="help mt-5">Routing scopes match device and address-space scope exactly. Hardware compatibility uses explicit role:, media:, mode:, and speed: tags; missing declarations are unknown. Checks do not simulate packet forwarding.</p>
  </div>
}
