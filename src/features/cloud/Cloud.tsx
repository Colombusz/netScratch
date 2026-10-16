import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { cloudClient, CONFIG_KEY, readCloudConfig, validateCloudConfig } from '../../cloud/client'
import { forkProject, projectRepository, type CloudProject } from '../../cloud/projects'
import { documentError } from '../../core/document'
import { useProjectStore } from '../../state/projectStore'
import { useTopologyUiStore } from '../../state/topologyUiStore'
import './cloud.css'

export default function Cloud() {
  const project = useProjectStore((s) => s.project)
  const openedEpoch = useProjectStore((s) => s.openedEpoch)
  const [url, setUrl] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [client, setClient] = useState<SupabaseClient | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [recovery, setRecovery] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [projects, setProjects] = useState<CloudProject[]>([])
  const [binding, setBinding] = useState<{ id: string; revision: number; epoch: number } | null>(null)
  const generation = useRef(0)
  const sessionOwner = useRef<string | null>(null)
  const currentDocument = useRef(project)
  const savedDocument = useRef<typeof project | null>(null)
  currentDocument.current = project
  const owner = session?.user.id
  const bound = binding?.epoch === openedEpoch && binding.id === project.id ? binding : null
  const repository = client && owner ? projectRepository(client, owner) : null

  useEffect(() => {
    try {
      const config = readCloudConfig()
      if (config) { setUrl(config.url); setPublicKey(config.publicKey); setClient(cloudClient(config)) }
    } catch (cause) { setError(documentError(cause)) }
  }, [])

  useEffect(() => {
    if (!client) return
    setReady(false)
    let cancelled = false
    void client.auth.getSession().then(({ error: failure }) => { if (!cancelled && failure) setError(failure.message) }).catch((cause) => { if (!cancelled) setError(documentError(cause)) })
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (sessionOwner.current !== (next?.user.id ?? null)) {
        generation.current++; sessionOwner.current = next?.user.id ?? null
        setProjects([]); setBinding(null); savedDocument.current = null; setBusy('')
      }
      setSession(next); setReady(true)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (!next) setRecovery(false)
    })
    return () => { cancelled = true; data.subscription.unsubscribe(); generation.current++ }
  }, [client])

  useEffect(() => {
    if (!client || !owner) return
    const ticket = generation.current
    setBusy('Loading cloud projects')
    void projectRepository(client, owner).list().then((rows) => {
      if (ticket === generation.current) { setProjects(rows); setError('') }
    }).catch((cause) => { if (ticket === generation.current) setError(documentError(cause)) })
      .finally(() => { if (ticket === generation.current) setBusy('') })
  }, [client, owner])

  async function run(label: string, action: (ticket: number) => Promise<void>) {
    if (busy) return
    const ticket = generation.current
    setBusy(label); setError(''); setFeedback('')
    try { await action(ticket) }
    catch (cause) { if (ticket === generation.current) setError(documentError(cause)) }
    finally { if (ticket === generation.current) setBusy('') }
  }

  async function authenticate(kind: 'signIn' | 'signUp') {
    if (!client) return
    await run(kind === 'signIn' ? 'Signing in' : 'Creating account', async () => {
      const credentials = { email: email.trim(), password }
      const { data, error: failure } = kind === 'signIn' ? await client.auth.signInWithPassword(credentials) : await client.auth.signUp({ ...credentials, options: { emailRedirectTo: window.location.origin + window.location.pathname } })
      if (failure) throw failure
      setPassword('')
      setFeedback(kind === 'signUp' && !data.session ? 'Check your email to confirm your account, then sign in.' : 'Signed in. Cloud projects are private to this account.')
    })
  }

  async function save(copy: boolean) {
    if (!repository) return
    const snapshot = project
    const originEpoch = openedEpoch
    const next = copy ? forkProject(snapshot) : snapshot
    await run('Saving cloud project', async (ticket) => {
      const revision = await repository.save(next, copy ? null : bound?.revision ?? null)
      if (ticket !== generation.current) return
      if (copy && currentDocument.current === snapshot && useProjectStore.getState().openedEpoch === originEpoch) {
        useProjectStore.getState().openProject(next)
        useTopologyUiStore.getState().select(null)
        setBinding({ id: next.id, revision, epoch: useProjectStore.getState().openedEpoch }); savedDocument.current = useProjectStore.getState().project
      } else if (!copy && useProjectStore.getState().openedEpoch === originEpoch && currentDocument.current.id === next.id) {
        setBinding({ id: next.id, revision, epoch: originEpoch }); savedDocument.current = snapshot
      }
      setFeedback(`Saved ${next.name} to the cloud. Changes made while saving still need another save.`)
      const rows = await repository.list()
      if (ticket === generation.current) setProjects(rows)
    })
  }

  function configure(event: FormEvent) {
    event.preventDefault()
    try {
      const config = validateCloudConfig({ url, publicKey })
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
      setClient(cloudClient(config)); setError(''); setFeedback('Cloud connection configured. Sign in to use cloud projects.')
    } catch (cause) { setError(documentError(cause)) }
  }

  return <div className="work-area cloud-workspace">
    <header className="page-heading"><p className="section-index">09 / Account and projects</p><h1>Cloud projects</h1><p>Optionally save private project copies to Supabase. Browser saving and JSON files remain available.</p></header>
    {error && <p role="alert" className="error mb-4">{error}</p>}
    {feedback && <p role="status" className="notice mb-4">{feedback}</p>}
    {busy && <p role="status" className="notice mb-4">{busy}…</p>}
    {!client ? <section className="panel"><h2>Connect Supabase</h2><p className="help mb-4">Use your project URL and publishable (or legacy anon) key after applying the database migration. These public connection details are saved in this browser. No env file is required.</p>
      <form onSubmit={configure}><div className="field"><label htmlFor="cloud-url">Supabase project URL</label><input id="cloud-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-project.supabase.co" /></div>
        <div className="field"><label htmlFor="cloud-key">Public browser key</label><input id="cloud-key" required value={publicKey} onChange={(e) => setPublicKey(e.target.value)} autoComplete="off" spellCheck={false} /></div>
        <button className="primary" type="submit">Connect Supabase</button></form>
    </section> : <>
      <section className="panel"><div className="section-heading"><h2>Account</h2><span className="help cloud-endpoint">{url}</span></div>
        {!ready ? <p role="status">Restoring account session…</p> : !session ? <form onSubmit={(e) => { e.preventDefault(); void authenticate('signIn') }}>
          <div className="field"><label htmlFor="cloud-email">Email</label><input id="cloud-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="cloud-password">Password</label><input id="cloud-password" type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div className="cloud-actions"><button type="submit" className="primary" disabled={Boolean(busy)}>Sign in</button><button type="button" disabled={Boolean(busy) || !email.trim() || password.length < 6} onClick={() => void authenticate('signUp')}>Create account</button>
            <button type="button" disabled={Boolean(busy) || !email.trim()} onClick={() => void run('Sending recovery email', async () => { const { error: failure } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + window.location.pathname }); if (failure) throw failure; setFeedback('If this account exists, a recovery link will arrive by email.') })}>Reset password</button></div>
        </form> : <>
          <p className="cloud-endpoint">Signed in as {session.user.email}</p>
          <div className="cloud-actions"><button type="button" disabled={Boolean(busy)} onClick={() => void run('Signing out', async () => { const { error: failure } = await client.auth.signOut({ scope: 'local' }); if (failure) throw failure; setFeedback('Signed out. The open project remains saved in this browser.') })}>Sign out</button><button type="button" onClick={() => setRecovery((value) => !value)}>Change password</button></div>
          {recovery && <form className="mt-4" onSubmit={(e) => { e.preventDefault(); void run('Updating password', async () => { const { error: failure } = await client.auth.updateUser({ password }); if (failure) throw failure; setPassword(''); setRecovery(false); setFeedback('Password updated.') }) }}><div className="field"><label htmlFor="new-cloud-password">New password</label><input id="new-cloud-password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></div><button type="submit" disabled={Boolean(busy)}>Update password</button></form>}
        </>}
      </section>
      {repository && <section className="panel"><div className="section-heading"><h2>Your cloud projects</h2><button type="button" disabled={Boolean(busy)} onClick={() => void run('Refreshing cloud projects', async (ticket) => { const rows = await repository.list(); if (ticket === generation.current) setProjects(rows) })}>Refresh list</button></div>
        <p className="help">Open project: <strong>{project.name}</strong>. {bound ? `Based on cloud revision ${bound.revision}. ${savedDocument.current === project ? 'Cloud copy is current.' : 'Save applied changes when ready.'}` : 'This document has not been opened or saved from this account in this session.'}</p>
        <div className="cloud-actions"><button type="button" className="primary" disabled={Boolean(busy)} onClick={() => void save(false)}>Save project to cloud</button><button type="button" disabled={Boolean(busy)} onClick={() => void save(true)}>Save as new cloud copy</button></div>
        {!projects.length && !busy ? <p className="empty-state">No cloud projects yet. Save the open project to create one.</p> : <ul className="cloud-project-list">{projects.map((item) => <li key={item.id}><div><strong>{item.name}</strong><p className="help">Revision {item.revision} · {new Date(item.updated_at).toLocaleString()}</p></div><div className="cloud-actions">
          <button type="button" disabled={Boolean(busy)} aria-label={`Open cloud project ${item.name}`} onClick={() => {
            if (!window.confirm(`Open ${item.name} and replace the current project? Download JSON first to keep the open work.`)) return
            const snapshot = project
            void run('Opening cloud project', async (ticket) => {
              const next = await repository.open(item.id)
              if (ticket !== generation.current) return
              if (currentDocument.current !== snapshot) throw new Error('The open project changed while downloading. Try opening the cloud project again after saving your edits.')
              useProjectStore.getState().openProject(next.project); useTopologyUiStore.getState().select(null)
              savedDocument.current = useProjectStore.getState().project; setBinding({ id: next.project.id, revision: next.revision, epoch: useProjectStore.getState().openedEpoch }); setFeedback(`Opened ${next.project.name}.`)
            })
          }}>Open</button>
          <button type="button" disabled={Boolean(busy)} aria-label={`Delete cloud project ${item.name}`} onClick={() => {
            if (!window.confirm(`Permanently delete cloud project ${item.name}? The open browser project is kept.`)) return
            void run('Deleting cloud project', async (ticket) => { await repository.remove(item.id, item.revision); if (ticket !== generation.current) return; if (bound?.id === item.id) setBinding(null); setFeedback(`Deleted cloud copy of ${item.name}.`); const rows = await repository.list(); if (ticket === generation.current) setProjects(rows) })
          }}>Delete</button></div></li>)}</ul>}
      </section>}
      <button type="button" disabled={Boolean(busy)} onClick={() => {
        if (!window.confirm('Disconnect Supabase and remove this browser’s cloud sign-in? The open project and its browser save will remain.')) return
        void run('Disconnecting cloud', async () => { const { error: failure } = await client.auth.signOut({ scope: 'local' }); if (failure) throw failure; localStorage.removeItem(CONFIG_KEY); generation.current++; setClient(null); setSession(null); setBinding(null); setProjects([]); setReady(false); setBusy(''); setFeedback('Cloud disconnected.') })
      }}>Disconnect cloud</button>
    </>}
    <p className="help mt-5">Cloud saves are explicit. Signing out keeps the open document and browser backups on this device. On a shared computer, remove local project data through your browser after downloading any work you need.</p>
  </div>
}
