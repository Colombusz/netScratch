import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`)
  await db.exec(await readFile(new URL('../../supabase/migrations/202610160001_projects.sql', import.meta.url), 'utf8'))
}, 30000)
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec('reset role; truncate auth.users cascade;')
  await db.query('insert into auth.users values ($1), ($2)', [a, b])
})
async function as(owner: string, role = 'authenticated') {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner])
  await db.exec(`set role ${role}`)
}
async function insert(owner: string, id = 'project') {
  return db.query('insert into public.projects (owner_id,id,name,document) values ($1,$2,$3,$4) returning revision', [owner, id, 'Plan', { id, name: 'Plan', schemaVersion: 1 }])
}
describe('cloud projects migration against Postgres', () => {
  it('isolates two users even for unfiltered reads and guessed IDs', async () => {
    await as(a); await insert(a)
    await as(b); expect((await db.query('select * from public.projects')).rows).toEqual([])
    expect((await db.query("update public.projects set name='Plan' where id='project' returning id")).rows).toEqual([])
    expect((await db.query("delete from public.projects where id='project' returning id")).rows).toEqual([])
    await insert(b)
    expect((await db.query('select owner_id from public.projects')).rows).toEqual([{ owner_id: b }])
    await as(a); expect((await db.query('select owner_id from public.projects')).rows).toEqual([{ owner_id: a }])
  })
  it('rejects anonymous access, forged ownership, owner reassignment, revision tampering, and direct trigger calls', async () => {
    await as('', 'anon'); await expect(db.query('select * from public.projects')).rejects.toThrow('permission denied')
    await expect(insert(a)).rejects.toThrow('permission denied')
    await as(b); await expect(insert(a)).rejects.toThrow('row-level security')
    await insert(b)
    await expect(db.query('update public.projects set owner_id=$1', [a])).rejects.toThrow('permission denied')
    await expect(db.query('update public.projects set revision=123')).rejects.toThrow('permission denied')
    await expect(db.query('select public.advance_project_revision()')).rejects.toThrow('permission denied')
  })
  it('uses server revisions to reject stale saves/deletes and preserve creation times', async () => {
    await as(a); expect((await insert(a)).rows).toEqual([{ revision: 1 }])
    const first = (await db.query<{ created_at: Date }>('select created_at from public.projects')).rows[0]!
    const update = "update public.projects set name='Changed', document=$1 where id='project' and revision=$2 returning revision,created_at"
    const doc = { id: 'project', name: 'Changed', schemaVersion: 1 }
    expect((await db.query(update, [doc, 1])).rows).toEqual([{ revision: 2, created_at: first.created_at }])
    expect((await db.query(update, [doc, 1])).rows).toEqual([])
    expect((await db.query("delete from public.projects where id='project' and revision=1 returning id")).rows).toEqual([])
    expect((await db.query("delete from public.projects where id='project' and revision=2 returning id")).rows).toEqual([{ id: 'project' }])
  })
  it.each([{}, { id: 'wrong', name: 'Plan', schemaVersion: 1 }, { id: null, name: 'Plan', schemaVersion: 1 }, { id: 'project', name: 'Plan', schemaVersion: 2 }, { id: 'project', name: null, schemaVersion: 1 }, []])('rejects malformed or unsupported document %j', async (document) => {
    await as(a)
    await expect(db.query('insert into public.projects (owner_id,id,name,document) values ($1,$2,$3,$4)', [a, 'project', 'Plan', document])).rejects.toThrow('project_document_shape')
  })
  it('removes projects when their auth user is deleted', async () => {
    await as(a); await insert(a); await db.exec('reset role'); await db.query('delete from auth.users where id=$1', [a])
    expect((await db.query('select * from public.projects')).rows).toEqual([])
  })
})
