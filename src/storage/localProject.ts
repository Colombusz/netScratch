import { documentError, parseProjectJson, serializeProject } from '../core/document'
import type { Project } from '../core/schema'

export const PROJECT_KEY = 'netscratch.project.v1'
export const BACKUP_KEY = 'netscratch.backup.v1'
export const RECOVERY_KEY = 'netscratch.recovery.v1'
export type ProjectStorage = Pick<Storage, 'getItem' | 'setItem'>
export type SaveState = { status: 'saved' | 'error' | 'recovery' | 'conflict'; message: string; recoveryRaw?: string; paused?: boolean }

export function createLocalProject(options: { storage: ProjectStorage; restore: (project: Project) => void; status: (state: SaveState) => void }) {
  const { storage, restore, status } = options
  let lastSeen: string | null = null
  let blocked = false
  let restoring = false
  let recoveryRaw: string | undefined
  const failed = (cause: unknown) => status({ status: 'error', message: `Changes are only in memory. Browser save failed: ${documentError(cause)} Export JSON to keep a copy.`, recoveryRaw, paused: blocked })
  const saved = () => status({ status: 'saved', message: 'Committed changes are saved in this browser. Export JSON to keep a portable copy.', recoveryRaw, paused: false })

  function restoreWithoutSaving(project: Project) {
    restoring = true
    try { restore(project) } finally { restoring = false }
  }

  function save(project: Project, preserveBackup = false) {
    if (blocked || restoring) return
    try {
      const current = storage.getItem(PROJECT_KEY)
      if (current !== lastSeen) { conflict(); return }
      const text = serializeProject(project)
      if (current !== text) {
        if (current !== null && !preserveBackup) storage.setItem(BACKUP_KEY, current)
        storage.setItem(PROJECT_KEY, text)
        lastSeen = text
      }
      saved()
    } catch (cause) { failed(cause) }
  }

  function start(project: Project) {
    try {
      lastSeen = storage.getItem(PROJECT_KEY)
      recoveryRaw = storage.getItem(RECOVERY_KEY) ?? undefined
      if (lastSeen === null) { save(project); return }
      try { restoreWithoutSaving(parseProjectJson(lastSeen)); saved() }
      catch (cause) {
        blocked = true
        recoveryRaw = lastSeen
        const backup = storage.getItem(BACKUP_KEY)
        let recovered = false
        if (backup) {
          try { restoreWithoutSaving(parseProjectJson(backup)); recovered = true } catch { /* Keep the unreadable primary available for download. */ }
        }
        status({ status: 'recovery', message: `${recovered ? 'The previous-save backup was opened.' : 'The saved project could not be opened; a temporary empty project is open.'} Autosave is paused to preserve the unreadable save. ${documentError(cause)}`, recoveryRaw, paused: true })
      }
    } catch (cause) { failed(cause) }
  }

  function resume(project: Project) {
    try {
      const current = storage.getItem(PROJECT_KEY)
      if (recoveryRaw !== undefined) storage.setItem(RECOVERY_KEY, recoveryRaw)
      lastSeen = current
      blocked = false
      save(project, current === recoveryRaw)
    } catch (cause) { failed(cause) }
  }

  function loadSaved() {
    try {
      const text = storage.getItem(PROJECT_KEY)
      if (text === null) throw new Error('There is no saved project in this browser.')
      const project = parseProjectJson(text)
      lastSeen = text
      blocked = false
      restoreWithoutSaving(project)
      saved()
    } catch (cause) { failed(cause) }
  }

  function conflict() {
    blocked = true
    status({ status: 'conflict', message: 'Another tab changed the browser save. Your work is still open here. Export JSON, then load the saved project or explicitly keep this project.', recoveryRaw, paused: true })
  }

  function externalChange(value: string | null) { if (value !== lastSeen) conflict() }
  function backup(): Project {
    const text = storage.getItem(BACKUP_KEY)
    if (text === null) throw new Error('No previous-save backup is available yet.')
    return parseProjectJson(text)
  }
  return { start, save, resume, loadSaved, externalChange, backup }
}
