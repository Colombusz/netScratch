import { describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { validateCloudConfig } from './client'
import { CloudConflict, forkProject, projectRepository } from './projects'
import { createEmptyProject } from '../core/schema'

const config = { url: 'https://example.supabase.co', publicKey: 'sb_publishable_test' }
function harness(body: unknown, status = 200) {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  const client = createClient(config.url, config.publicKey, { db: { retry: false }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } })
  return { repo: projectRepository(client, 'owner'), fetcher }
}
describe('cloud configuration and repository', () => {
  it('accepts public connection details and rejects secret keys or unsafe endpoints', () => {
    expect(validateCloudConfig(config)).toEqual(config)
    const anon = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role: 'anon' }))}.signature`
    expect(validateCloudConfig({ url: 'http://localhost:54321/', publicKey: anon }).url).toBe('http://localhost:54321')
    for (const url of ['http://example.com', 'https://example.com/path', 'https://user:pass@example.com', 'https://example.com?q=x', 'javascript:foo']) expect(() => validateCloudConfig({ ...config, url })).toThrow()
    for (const publicKey of ['sb_secret_test', 'invalid', `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`]) expect(() => validateCloudConfig({ ...config, publicKey })).toThrow('publishable')
  })
  it('lists metadata without downloading full documents and filters by owner', async () => {
    const { repo, fetcher } = harness([]); expect(await repo.list()).toEqual([])
    const url = new URL(String(fetcher.mock.calls[0]![0])); expect(url.searchParams.get('owner_id')).toBe('eq.owner'); expect(url.searchParams.get('select')).not.toContain('document')
  })
  it('validates downloaded documents before replacing local work', async () => {
    const project = createEmptyProject(); expect(await harness({ document: project, revision: 3 }).repo.open(project.id)).toEqual({ project, revision: 3 })
    await expect(harness({ document: { schemaVersion: 99 }, revision: 4 }).repo.open('bad')).rejects.toThrow('Update netScratch')
    await expect(harness({ message: 'Denied' }, 403).repo.open('bad')).rejects.toMatchObject({ message: 'Denied' })
  })
  it('inserts new documents and updates only the known revision; never upserts', async () => {
    const project = createEmptyProject(); const { repo, fetcher } = harness({ revision: 2 })
    expect(await repo.save(project, null)).toBe(2)
    expect(fetcher.mock.calls[0]![1]!.method).toBe('POST')
    expect(await repo.save(project, 1)).toBe(2)
    const request = fetcher.mock.calls[1]!
    expect(new URL(String(request[0])).searchParams.get('revision')).toBe('eq.1'); expect(request[1]!.method).toBe('PATCH')
    expect(JSON.parse(String(request[1]!.body))).not.toHaveProperty('revision')
  })
  it('rejects stale updates, duplicate inserts, stale deletes and service errors', async () => {
    const project = createEmptyProject()
    await expect(harness(null).repo.save(project, 1)).rejects.toBeInstanceOf(CloudConflict)
    await expect(harness({ code: '23505', message: 'duplicate' }, 409).repo.save(project, null)).rejects.toBeInstanceOf(CloudConflict)
    await expect(harness({ message: 'Offline' }, 503).repo.save(project, 1)).rejects.toMatchObject({ message: 'Offline' })
    await expect(harness(null).repo.remove(project.id, 1)).rejects.toBeInstanceOf(CloudConflict)
    await expect(harness({ message: 'Denied' }, 403).repo.remove(project.id, 1)).rejects.toMatchObject({ message: 'Denied' })
    await harness({ id: project.id }).repo.remove(project.id, 1)
    await expect(harness({ message: 'Offline' }, 503).repo.list()).rejects.toMatchObject({ message: 'Offline' })
  })
  it('creates an independent cloud copy with remapped project writing attachments', () => {
    const project = createEmptyProject('Office')
    project.notes = [{ id: 'note', text: 'Plan', attachedTo: { entityType: 'project', id: project.id } }]
    project.checklistItems = [{ id: 'task', task: 'Build', status: 'todo', attachedTo: { entityType: 'note', id: 'note' } }]
    const copy = forkProject(project)
    expect(copy.id).not.toBe(project.id); expect(copy.notes[0]!.attachedTo!.id).toBe(copy.id)
    expect(copy.checklistItems[0]!.attachedTo!.id).toBe('note'); expect(project.notes[0]!.attachedTo!.id).toBe(project.id)
  })
  it('rejects invalid or oversized documents before sending a write', async () => {
    const { repo, fetcher } = harness({ revision: 1 })
    const project = createEmptyProject()
    await expect(repo.save({ ...project, schemaVersion: 99 } as unknown as typeof project, null)).rejects.toThrow('Update netScratch')
    project.notes = [{ id: 'large-note', text: 'x'.repeat(21 * 1024 * 1024) }]
    await expect(repo.save(project, null)).rejects.toThrow('smaller than 20 MiB')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
