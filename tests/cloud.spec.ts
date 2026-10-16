import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Project } from '../src/core/schema'

const endpoint = 'https://netscratch-test.supabase.co'
const owner = '11111111-1111-4111-8111-111111111111'
type Row = { id: string; name: string; document: Project; revision: number; updated_at: string }
async function service(page: Page) {
  const rows = new Map<string, Row>()
  let failSave = false
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'engineer@example.test', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, identities: [] }
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`
  const session = { access_token: token, refresh_token: 'test-refresh-token', expires_in: 3600, token_type: 'bearer', user }
  await page.route(`${endpoint}/**`, async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method()
    const respond = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/auth/v1/token') {
      const data = request.postDataJSON()
      return data.password === 'wrong-password' ? respond({ msg: 'Invalid login credentials', error_code: 'invalid_credentials' }, 400) : respond(session)
    }
    if (url.pathname === '/auth/v1/signup') return respond({ user, session: null })
    if (url.pathname === '/auth/v1/recover' || url.pathname === '/auth/v1/logout') return respond({})
    if (url.pathname === '/auth/v1/user') return respond(user)
    if (url.pathname === '/rest/v1/projects') {
      const id = url.searchParams.get('id')?.slice(3)
      if (method === 'GET') {
        if (url.searchParams.get('select')?.includes('document')) {
          const row = rows.get(id!); return row ? respond({ document: row.document, revision: row.revision }) : respond({ message: 'Project not found' }, 406)
        }
        return respond([...rows.values()].map(({ document: _document, ...row }) => row))
      }
      if (failSave && (method === 'PATCH' || method === 'POST')) return respond({ message: 'Cloud temporarily unavailable' }, 503)
      if (method === 'POST') {
        const input = request.postDataJSON(); if (rows.has(input.id)) return respond({ code: '23505', message: 'duplicate' }, 409)
        const row = { ...input, revision: 1, updated_at: new Date().toISOString() }; rows.set(row.id, row); return respond({ revision: 1 })
      }
      const row = rows.get(id!), revision = Number(url.searchParams.get('revision')?.slice(3))
      if (!row || row.revision !== revision) return respond(null)
      if (method === 'PATCH') { Object.assign(row, request.postDataJSON(), { revision: revision + 1, updated_at: new Date().toISOString() }); return respond({ revision: row.revision }) }
      if (method === 'DELETE') { rows.delete(id!); return respond({ id }) }
    }
    return respond({ message: `Unexpected fixture request ${method} ${url.pathname}` }, 404)
  })
  return { rows, setFailSave: (value: boolean) => { failSave = value } }
}

async function connect(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: '09 Cloud', exact: true }).click()
  await page.getByLabel('Supabase project URL').fill(endpoint)
  await page.getByLabel('Public browser key').fill('sb_publishable_test')
  await page.getByRole('button', { name: 'Connect Supabase', exact: true }).click()
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
}
async function signIn(page: Page) {
  await page.getByLabel('Email', { exact: true }).fill('engineer@example.test')
  await page.getByLabel('Password', { exact: true }).fill('correct-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('No cloud projects yet.', { exact: false })).toBeVisible()
}
async function rename(page: Page, name: string) { await page.getByLabel('Project name', { exact: true }).fill(name); await page.getByLabel('Project name', { exact: true }).press('Enter') }

test('cloud account, save/open/update, conflict, copy, deletion, failure and reload use the real SDK', async ({ page }) => {
  const cloud = await service(page); const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message))
  await connect(page)
  await page.getByLabel('Email', { exact: true }).fill('engineer@example.test'); await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Invalid login credentials')
  await signIn(page); await rename(page, 'Office cloud plan')
  await page.getByRole('button', { name: 'Save project to cloud', exact: true }).click()
  await expect(page.getByText('Based on cloud revision 1.', { exact: false })).toBeVisible()
  expect(cloud.rows.size).toBe(1)
  const row = [...cloud.rows.values()][0]!
  await rename(page, 'Local edits'); row.revision++
  await page.getByRole('button', { name: 'Save project to cloud', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('cloud project changed')
  expect(row.name).toBe('Office cloud plan')
  await page.getByRole('button', { name: 'Save as new cloud copy', exact: true }).click()
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Local edits copy')
  expect(cloud.rows.size).toBe(2)
  await page.getByRole('button', { name: 'Refresh list', exact: true }).click()
  page.once('dialog', (d) => d.accept()); await page.getByRole('button', { name: 'Open cloud project Office cloud plan', exact: true }).click()
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Office cloud plan')
  await rename(page, 'Updated cloud plan'); await page.getByRole('button', { name: 'Save project to cloud', exact: true }).click()
  await expect(page.getByText('Based on cloud revision 3.', { exact: false })).toBeVisible()
  expect(row.name).toBe('Updated cloud plan')
  cloud.setFailSave(true); await rename(page, 'Unsynced local work'); await page.getByRole('button', { name: 'Save project to cloud', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Cloud temporarily unavailable')
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Unsynced local work')
  cloud.setFailSave(false)
  page.once('dialog', (d) => d.accept()); await page.getByRole('button', { name: 'Delete cloud project Local edits copy', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Delete cloud project Local edits copy', exact: true })).toHaveCount(0)
  await page.reload(); await page.getByRole('button', { name: '09 Cloud', exact: true }).click()
  await expect(page.getByText('Signed in as engineer@example.test')).toBeVisible()
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Unsynced local work')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Unsynced local work')
  page.once('dialog', (d) => d.accept()); await page.getByRole('button', { name: 'Disconnect cloud', exact: true }).click()
  await expect(page.getByLabel('Supabase project URL')).toBeVisible()
  expect(errors).toEqual([])
})

test('account creation, recovery and password changes have visible results', async ({ page }) => {
  await service(page); await connect(page)
  await page.getByLabel('Email', { exact: true }).fill('engineer@example.test'); await page.getByLabel('Password', { exact: true }).fill('correct-password')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByText('Check your email to confirm your account, then sign in.')).toBeVisible()
  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  await expect(page.getByText('If this account exists, a recovery link will arrive by email.')).toBeVisible()
  await page.goto('/?code=recovery-code')
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible()
  await page.getByLabel('New password', { exact: true }).fill('another-password')
  await page.getByRole('button', { name: 'Update password', exact: true }).click()
  await expect(page.getByText('Password updated.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0)
})

test('cloud connection rejects private keys, passes accessibility in both themes, and reflows on narrow screens', async ({ page }) => {
  await service(page); await page.goto('/'); await page.getByRole('button', { name: '09 Cloud', exact: true }).click()
  await page.getByLabel('Supabase project URL').fill(endpoint); await page.getByLabel('Public browser key').fill('sb_secret_do_not_use')
  await page.getByRole('button', { name: 'Connect Supabase', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Secret and service-role keys')
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Use dark theme' }).click()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  }
  await page.getByLabel('Public browser key').fill('sb_publishable_test'); await page.getByRole('button', { name: 'Connect Supabase', exact: true }).click()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await signIn(page); await page.getByRole('button', { name: 'Save project to cloud', exact: true }).click()
  await expect(page.getByRole('button', { name: /Open cloud project/ })).toBeVisible()
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Use light theme' }).click()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/cloud-${theme}.png`, fullPage: true })
  }
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 1000 }); await page.screenshot({ path: 'test-results/cloud-mobile.png', fullPage: true })
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
