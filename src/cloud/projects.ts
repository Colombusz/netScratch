import type { SupabaseClient } from '@supabase/supabase-js'
import { parseProjectJson } from '../core/document'
import type { Project } from '../core/schema'

export type CloudProject = { id: string; name: string; updated_at: string; revision: number }
export class CloudConflict extends Error {
  constructor() { super('The cloud project changed or was removed. Refresh the list, open the latest version, or save a new copy to preserve your work.') }
}
export function forkProject(project: Project): Project {
  const id = crypto.randomUUID()
  const remap = <T extends { attachedTo?: { entityType: string; id: string } }>(item: T): T => item.attachedTo?.entityType === 'project' && item.attachedTo.id === project.id ? { ...item, attachedTo: { ...item.attachedTo, id } } : item
  const now = new Date().toISOString()
  return { ...project, id, name: `${project.name} copy`, createdAt: now, updatedAt: now, notes: project.notes.map(remap), checklistItems: project.checklistItems.map(remap) }
}

export function projectRepository(client: SupabaseClient, ownerId: string) {
  return {
    async list(): Promise<CloudProject[]> {
      const { data, error } = await client.from('projects').select('id,name,updated_at,revision').eq('owner_id', ownerId).order('updated_at', { ascending: false })
      if (error) throw error
      return data
    },
    async open(id: string): Promise<{ project: Project; revision: number }> {
      const { data, error } = await client.from('projects').select('document,revision').eq('owner_id', ownerId).eq('id', id).single()
      if (error) throw error
      return { project: parseProjectJson(JSON.stringify(data.document)), revision: data.revision }
    },
    async save(project: Project, revision: number | null): Promise<number> {
      const document = parseProjectJson(JSON.stringify(project))
      if (new TextEncoder().encode(JSON.stringify(document)).length > 20 * 1024 * 1024) throw new Error('Cloud project documents must be smaller than 20 MiB. Download JSON to keep this project.')
      const query = revision === null
        ? client.from('projects').insert({ id: document.id, owner_id: ownerId, name: document.name, document })
        : client.from('projects').update({ name: document.name, document }).eq('owner_id', ownerId).eq('id', document.id).eq('revision', revision)
      const { data, error } = await query.select('revision').maybeSingle()
      if (error) { if (error.code === '23505') throw new CloudConflict(); throw error }
      if (!data) throw new CloudConflict()
      return data.revision
    },
    async remove(id: string, revision: number): Promise<void> {
      const { data, error } = await client.from('projects').delete().eq('owner_id', ownerId).eq('id', id).eq('revision', revision).select('id').maybeSingle()
      if (error) throw error
      if (!data) throw new CloudConflict()
    },
  }
}
