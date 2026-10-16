import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type CloudConfig = { url: string; publicKey: string }
export const CONFIG_KEY = 'netscratch.cloud.config.v1'

export function validateCloudConfig(input: CloudConfig): CloudConfig {
  const url = new URL(input.url.trim())
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use an HTTPS Supabase project URL (or HTTP localhost for development).')
  const publicKey = input.publicKey.trim()
  let anon = false
  try { anon = JSON.parse(atob(publicKey.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon' } catch { /* Publishable keys do not contain a JWT payload. */ }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey) && !anon) throw new Error('Use a publishable key or legacy anon key. Secret and service-role keys must never be used in the browser.')
  return { url: url.origin, publicKey }
}

let active: { config: CloudConfig; client: SupabaseClient } | null = null
export function cloudClient(config: CloudConfig): SupabaseClient {
  const valid = validateCloudConfig(config)
  if (!active || active.config.url !== valid.url || active.config.publicKey !== valid.publicKey) {
    active?.client.auth.stopAutoRefresh()
    active = { config: valid, client: createClient(valid.url, valid.publicKey, { db: { timeout: 20000 }, auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } }) }
  }
  return active.client
}

export function readCloudConfig(): CloudConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY)
  return raw ? validateCloudConfig(JSON.parse(raw)) : null
}
