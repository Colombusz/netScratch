import { useState, type FormEvent, type ReactNode } from 'react'
import { z } from 'zod'
import { deviceSchema } from '../../core/schema'

export const roles = deviceSchema.shape.role.options
export const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
export function errorMessage(cause: unknown): string {
  return cause instanceof z.ZodError ? cause.issues.map((issue) => `${issue.path.join('.') || 'Input'}: ${issue.message}`).join('\n') : (cause as Error).message
}

export function EditorForm({ children, onSubmit, submitLabel, onCancel }: {
  children: ReactNode; onSubmit: () => void; submitLabel: string; onCancel?: () => void
}) {
  const [error, setError] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    try { onSubmit(); setError('') } catch (cause) { setError(errorMessage(cause)) }
  }
  return <form onSubmit={submit} noValidate onKeyDown={(event) => { if (event.key === 'Escape') onCancel?.() }}>
    {children}
    {error && <p role="alert" className="error mb-4">{error}</p>}
    <div className="flex flex-wrap gap-2"><button type="submit" className="primary">{submitLabel}</button>{onCancel && <button type="button" onClick={onCancel}>Cancel</button>}</div>
  </form>
}

export function MediaField({ value, onChange, id }: { value: 'copper' | 'fiber'; onChange: (value: 'copper' | 'fiber') => void; id: string }) {
  return <div className="field"><label htmlFor={id}>Media</label><select id={id} value={value} onChange={(event) => onChange(event.target.value as 'copper' | 'fiber')}><option value="copper">Copper</option><option value="fiber">Fiber</option></select></div>
}
