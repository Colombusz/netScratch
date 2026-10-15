import { z } from 'zod'
import { CURRENT_SCHEMA_VERSION, projectSchema, type Project } from './schema'

export function migrateProject(input: unknown): Project {
  const { schemaVersion } = z.object({ schemaVersion: z.number().int().positive() }).parse(input)
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`This project uses schema ${schemaVersion}. Update netScratch to open it.`)
  }
  return projectSchema.parse(input)
}
