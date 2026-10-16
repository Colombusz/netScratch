import { describe, expect, it } from 'vitest'
import { createEmptyProject, type Project } from '../core/schema'
import { serializeProject } from '../core/document'
import { createLocalProject, PROJECT_KEY, BACKUP_KEY, RECOVERY_KEY, type SaveState } from './localProject'

function fixture(entries: [string, string][] = []) {
  const data = new Map(entries)
  const states: SaveState[] = []
  const restored: Project[] = []
  let failure = ''
  const storage = { getItem: (key: string) => { if (failure === 'read') throw new Error('Storage denied'); return data.get(key) ?? null }, setItem: (key: string, value: string) => { if (failure === key) throw new Error('Quota exceeded'); data.set(key, value) } }
  const controller = createLocalProject({ storage, restore: (project) => restored.push(project), status: (state) => states.push(state) })
  return { controller, data, states, restored, fail: (key: string) => { failure = key } }
}

describe('browser project persistence', () => {
  it('saves committed state, retains the previous save, and reloads without rotating backups', () => {
    const original = createEmptyProject('Original')
    const changed = { ...original, name: 'Changed' }
    const f = fixture()
    f.controller.start(original)
    f.controller.save(changed)
    expect(f.data.get(PROJECT_KEY)).toBe(serializeProject(changed))
    expect(f.controller.backup()).toEqual(original)
    f.controller.save(changed)
    expect(f.controller.backup()).toEqual(original)
    const reload = fixture([...f.data])
    reload.controller.start(createEmptyProject())
    expect(reload.restored).toEqual([changed])
    expect(reload.controller.backup()).toEqual(original)
    expect(reload.states.at(-1)!.status).toBe('saved')
  })

  it('opens a valid backup while preserving an unreadable primary until explicit resumption', () => {
    const backup = createEmptyProject('Backup')
    const f = fixture([[PROJECT_KEY, '{ broken'], [BACKUP_KEY, serializeProject(backup)]])
    f.controller.start(createEmptyProject())
    expect(f.restored).toEqual([backup])
    expect(f.states.at(-1)!.status).toBe('recovery')
    f.controller.save({ ...backup, name: 'Unsaved edit' })
    expect(f.data.get(PROJECT_KEY)).toBe('{ broken')
    f.controller.resume(backup)
    expect(f.data.get(RECOVERY_KEY)).toBe('{ broken')
    expect(f.controller.backup()).toEqual(backup)
    expect(f.data.get(PROJECT_KEY)).toBe(serializeProject(backup))
    const reload = fixture([...f.data])
    reload.controller.start(createEmptyProject())
    expect(reload.states.at(-1)!.recoveryRaw).toBe('{ broken')
  })

  it('retains unsupported versions and damaged backups instead of overwriting them at startup', () => {
    const future = JSON.stringify({ ...createEmptyProject(), schemaVersion: 9 })
    const f = fixture([[PROJECT_KEY, future], [BACKUP_KEY, 'broken backup']])
    f.controller.start(createEmptyProject())
    expect(f.restored).toEqual([])
    expect(f.data.get(PROJECT_KEY)).toBe(future)
    expect(f.states.at(-1)!.message).toContain('temporary empty project')
    expect(() => f.controller.backup()).toThrow('not valid JSON')
    const noBackup = fixture([[PROJECT_KEY, 'broken']])
    noBackup.controller.start(createEmptyProject())
    expect(noBackup.states.at(-1)!.status).toBe('recovery')
    expect(() => noBackup.controller.backup()).toThrow('No previous-save backup')
  })

  it('reports failed reads, writes and backup writes without claiming to save or replacing old data', () => {
    const original = createEmptyProject()
    const f = fixture()
    f.fail('read'); f.controller.start(original)
    expect(f.states.at(-1)!.status).toBe('error')
    f.fail(PROJECT_KEY); f.controller.save(original)
    expect(f.data.has(PROJECT_KEY)).toBe(false)
    f.fail(''); f.controller.save(original)
    f.fail(BACKUP_KEY); f.controller.save({ ...original, name: 'Unsaved' })
    expect(f.data.get(PROJECT_KEY)).toBe(serializeProject(original))
    expect(f.states.at(-1)!.message).toContain('Quota exceeded')
    f.fail(''); f.controller.save({ ...original, name: 'Saved' })
    expect(f.states.at(-1)!.status).toBe('saved')
  })

  it('detects other-tab changes and requires an explicit choice before replacement', () => {
    const original = createEmptyProject('Original')
    const other = { ...original, name: 'Other tab' }
    const f = fixture()
    f.controller.start(original)
    f.data.set(PROJECT_KEY, serializeProject(other))
    f.controller.save({ ...original, name: 'This tab' })
    expect(f.states.at(-1)!.status).toBe('conflict')
    expect(f.data.get(PROJECT_KEY)).toBe(serializeProject(other))
    f.controller.loadSaved()
    expect(f.restored.at(-1)).toEqual(other)
    f.controller.externalChange(serializeProject(other))
    expect(f.states.at(-1)!.status).toBe('saved')
    f.controller.externalChange(null)
    expect(f.states.at(-1)!.status).toBe('conflict')
    f.controller.resume(original)
    expect(f.controller.backup()).toEqual(other)
    expect(f.data.get(PROJECT_KEY)).toBe(serializeProject(original))
  })

  it('keeps recovery paused when preserving the unreadable data fails', () => {
    const f = fixture([[PROJECT_KEY, 'broken']])
    const project = createEmptyProject()
    f.controller.start(project)
    f.fail(RECOVERY_KEY); f.controller.resume(project)
    expect(f.data.get(PROJECT_KEY)).toBe('broken')
    expect(f.states.at(-1)!.status).toBe('error')
    f.controller.save(project)
    expect(f.data.get(PROJECT_KEY)).toBe('broken')
  })

  it('reports missing or invalid explicit saved-project loads', () => {
    const f = fixture()
    f.controller.loadSaved()
    expect(f.states.at(-1)!.message).toContain('no saved project')
    f.data.set(PROJECT_KEY, 'broken'); f.controller.loadSaved()
    expect(f.states.at(-1)!.status).toBe('error')
    f.controller.externalChange('another tab saved a project')
    f.data.delete(PROJECT_KEY)
    f.controller.loadSaved()
    expect(f.states.at(-1)!.paused).toBe(true)
    f.controller.resume(createEmptyProject('Kept after another tab cleared storage'))
    expect(f.states.at(-1)!.status).toBe('saved')
  })
})
