import { test, expect, type Page, type Download } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { createEmptyProject, type Project } from '../src/core/schema'

const primaryKey = 'netscratch.project.v1'
const backupKey = 'netscratch.backup.v1'

function fixture(): Project {
  const project = createEmptyProject('Saved office plan')
  project.addressSpaces = [{ id: 'hq', name: 'Office', parentCidr: '10.0.0.0/24', scope: 'HQ' }, { id: 'branch', name: 'Branch', parentCidr: '172.16.0.0/24', scope: 'Branch' }]
  project.subnets = [{ id: 'staff', name: 'Staff', addressSpaceId: 'hq', cidr: '10.0.0.0/25', hostRequirement: 100, gatewayIp: '10.0.0.1', vlanId: 'vlan', status: 'allocated', source: 'auto', notes: 'Retain gateway' }, { id: 'branch-subnet', name: 'Branch LAN', addressSpaceId: 'branch', cidr: '172.16.0.0/25', hostRequirement: 50, gatewayIp: '172.16.0.1', vlanId: null, status: 'allocated', source: 'manual', notes: '' }]
  project.vlans = [{ id: 'vlan', number: 10, name: 'Staff' }]
  project.devices = [{ id: 'core', name: 'Core switch', role: 'switch', hardwareItemId: null, scope: 'HQ', notes: 'Install in rack' }, { id: 'edge', name: 'Edge router', role: 'router', hardwareItemId: null, scope: 'HQ', notes: '' }]
  project.ports = ['core', 'edge'].map((id) => ({ id: `${id}-port`, deviceId: id, name: 'eth0', speed: '1 Gbps', media: 'copper', mode: 'routed', accessVlanId: null, trunkVlanIds: [] }))
  project.links = [{ id: 'uplink', sourcePortId: 'core-port', targetPortId: 'edge-port', cableType: 'Cat6A', label: 'Office uplink' }]
  project.interfaces = [{ id: 'svi', name: 'Vlan10', deviceId: 'core', kind: 'SVI', portId: null, vlanId: 'vlan', address: '10.0.0.1/25' }]
  project.hardwareItems = [{ id: 'switch-model', model: 'Office switch model', category: 'Switch', quantityAvailable: 2, unitCost: 125.5, portCount: 24, capabilities: ['VLANs', 'routing'] }]
  project.allocations = [{ id: 'allocation', hardwareItemId: 'switch-model', deviceId: 'core', scope: null, quantity: 3 }]
  project.notes = [{ id: 'handoff', text: 'Keep the uplink label.\nVerify the gateway after installation.', attachedTo: { entityType: 'device', id: 'core' } }]
  project.checklistItems = [{ id: 'check', task: 'Confirm port labels', status: 'doing', attachedTo: { entityType: 'subnet', id: 'staff' } }]
  project.layout = { physical: { core: { x: -40, y: 70 }, edge: { x: 400, y: 70 } }, logical: { 'vlan:vlan': { x: 20, y: 40 }, 'subnet:staff': { x: 350, y: 40 }, 'iface:svi': { x: 680, y: 40 } } }
  return project
}

async function current(page: Page): Promise<Project> {
  return page.evaluate(async () => { const url = '/src/state/projectStore.ts'; return (await import(url)).useProjectStore.getState().project })
}

async function openFiles(page: Page) {
  await page.getByRole('button', { name: '07 Files', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Files and report', exact: true })).toBeVisible()
}

async function downloadContent(download: Download) { return readFile((await download.path())!, 'utf8') }

test('JSON round-trips the full document, resets planner drafts, and survives reload', async ({ page }) => {
  const project = fixture()
  await page.goto('/')
  await page.getByRole('button', { name: '02 Planner', exact: true }).click()
  await page.getByLabel('Parent block', { exact: true }).fill('192.168.200.0/24')
  await openFiles(page)
  const before = await current(page)
  await page.getByLabel('Editable project JSON', { exact: true }).fill(JSON.stringify(project))
  await page.getByRole('button', { name: 'Validate JSON', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Import preview: Saved office plan', exact: true })).toBeVisible()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Import project', exact: true }).click()
  expect(await current(page)).toEqual(before)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Import project', exact: true }).click()
  expect(await current(page)).toEqual(project)
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(project.name)
  await page.getByRole('button', { name: '02 Planner', exact: true }).click()
  await expect(page.getByLabel('Parent block', { exact: true })).toHaveValue('10.0.0.0/24')
  await expect(page.getByRole('region', { name: 'Subnet allocation table', exact: true })).toContainText('Staff')
  await page.getByLabel('Edit address space', { exact: true }).selectOption('branch')
  await expect(page.getByLabel('Parent block', { exact: true })).toHaveValue('172.16.0.0/24')
  await expect(page.getByRole('region', { name: 'Subnet allocation table', exact: true })).toContainText('Branch LAN')
  await openFiles(page)
  await page.getByRole('button', { name: 'Load current JSON', exact: true }).click()
  expect(JSON.parse(await page.getByLabel('Editable project JSON', { exact: true }).inputValue())).toEqual(project)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download project JSON', exact: true }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('Saved-office-plan.json')
  expect(JSON.parse(await downloadContent(download))).toEqual(project)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), primaryKey)).toEqual(project)
  await page.reload()
  expect(await current(page)).toEqual(project)
  await page.getByRole('button', { name: '02 Planner', exact: true }).click()
  await expect(page.getByLabel('Parent block', { exact: true })).toHaveValue('10.0.0.0/24')
  await page.getByRole('button', { name: 'Generate subnets', exact: true }).click()
  expect((await current(page)).addressSpaces).toHaveLength(2)
  expect((await current(page)).subnets.find((subnet) => subnet.id === 'staff')!.cidr).toBe('10.0.0.0/25')
})

test('file import rejects invalid documents atomically and previous-save review can restore a new project', async ({ page }) => {
  await page.goto('/')
  await openFiles(page)
  const before = await current(page)
  for (const text of ['{', JSON.stringify({ ...fixture(), schemaVersion: 99 }), JSON.stringify({ ...fixture(), devices: [] })]) {
    await page.getByLabel('Editable project JSON', { exact: true }).fill(text)
    await page.getByRole('button', { name: 'Import project', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    expect(await current(page)).toEqual(before)
  }
  const project = fixture()
  await page.getByLabel('Open JSON file', { exact: true }).setInputFiles({ name: 'office.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await expect(page.getByRole('heading', { name: 'Import preview: Saved office plan', exact: true })).toBeVisible()
  expect(await current(page)).toEqual(before)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Import project', exact: true }).click()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'New empty project', exact: true }).click()
  expect(await current(page)).toEqual(project)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'New empty project', exact: true }).click()
  expect((await current(page)).devices).toHaveLength(0)
  await page.getByRole('button', { name: 'Review previous save', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Import preview: Saved office plan', exact: true })).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Import project', exact: true }).click()
  expect(await current(page)).toEqual(project)
})

test('damaged primary recovery preserves the unreadable data and keeps the valid backup', async ({ page }) => {
  const project = fixture()
  await page.addInitScript(({ primaryKey, backupKey, project }) => {
    if (!localStorage.getItem('recovery-test-seeded')) {
      localStorage.setItem(primaryKey, '{ damaged save')
      localStorage.setItem(backupKey, JSON.stringify(project))
      localStorage.setItem('recovery-test-seeded', 'yes')
    }
  }, { primaryKey, backupKey, project })
  await page.goto('/')
  await expect(page.locator('.session-notice')).toContainText('Autosave is paused')
  expect(await current(page)).toEqual(project)
  await page.getByRole('button', { name: 'Review browser save', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download unreadable save', exact: true }).click()
  expect(await downloadContent(await pending)).toBe('{ damaged save')
  await page.getByLabel('Project name', { exact: true }).fill('Recovered and edited')
  await page.getByLabel('Project name', { exact: true }).press('Enter')
  expect(await page.evaluate((key) => localStorage.getItem(key), primaryKey)).toBe('{ damaged save')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Keep this project and save', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('netscratch.recovery.v1'))).toBe('{ damaged save')
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), backupKey)).toEqual(project)
  await page.reload()
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Recovered and edited')
  await expect(page.locator('.session-notice')).toContainText('saved in this browser')
})

test('unavailable storage keeps the project editable and downloadable and supports retry', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) { if (key.startsWith('netscratch.')) throw new DOMException('Quota exceeded', 'QuotaExceededError'); original.call(this, key, value) }
    Object.defineProperty(window, 'restoreStorageForTest', { value: () => { Storage.prototype.setItem = original } })
  })
  await page.goto('/')
  await page.getByLabel('Project name', { exact: true }).fill('Unsaved but open')
  await page.getByLabel('Project name', { exact: true }).press('Enter')
  await openFiles(page)
  await expect(page.locator('.session-notice')).toContainText('only in memory')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download project JSON', exact: true }).click()
  expect(JSON.parse(await downloadContent(await pending)).name).toBe('Unsaved but open')
  await page.evaluate(() => (window as unknown as { restoreStorageForTest: () => void }).restoreStorageForTest())
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click()
  await expect(page.locator('.session-notice')).toContainText('saved in this browser')
})

test('two tabs preserve their open work and require a choice after conflicting saves', async ({ page, context }) => {
  await page.goto('/')
  const other = await context.newPage()
  await other.goto('/')
  await page.getByLabel('Project name', { exact: true }).fill('First tab')
  await page.getByLabel('Project name', { exact: true }).press('Enter')
  await expect(other.locator('.session-notice')).toContainText('Another tab')
  await other.getByLabel('Project name', { exact: true }).fill('Second tab')
  await other.getByLabel('Project name', { exact: true }).press('Enter')
  expect((await current(other)).name).toBe('Second tab')
  expect(await other.evaluate((key) => JSON.parse(localStorage.getItem(key)!).name, primaryKey)).toBe('First tab')
  await openFiles(other)
  other.once('dialog', (dialog) => dialog.accept())
  await other.getByRole('button', { name: 'Load saved project', exact: true }).click()
  expect((await current(other)).name).toBe('First tab')
  await page.getByLabel('Project name', { exact: true }).fill('First tab revised')
  await page.getByLabel('Project name', { exact: true }).press('Enter')
  await expect(other.locator('.session-notice')).toContainText('Another tab')
  other.once('dialog', (dialog) => dialog.accept())
  await other.getByRole('button', { name: 'Keep this project and save', exact: true }).click()
  expect(await other.evaluate((key) => JSON.parse(localStorage.getItem(key)!).name, primaryKey)).toBe('First tab')
  await expect(page.locator('.session-notice')).toContainText('Another tab')
})

test('report prints seven sections, selectable SVG data and enlarged diagram tiles', async ({ page }) => {
  const project = fixture()
  await page.goto('/')
  await page.evaluate(async (project) => { const url = '/src/state/projectStore.ts'; (await import(url)).useProjectStore.getState().openProject(project) }, project)
  await openFiles(page)
  const report = page.locator('.print-report')
  await expect(report.locator('.report-section')).toHaveCount(7)
  await expect(report).toContainText('Hardware item Office switch model overallocated: 3 of 2.')
  await expect(report).toContainText('10.0.0.1/25')
  await expect(report).toContainText('Office uplink')
  await expect(report).toContainText('Confirm port labels')
  await expect(report.locator('svg g[data-entity-id="core"]')).toHaveAttribute('transform', 'translate(-40 70)')
  await expect(report.locator('svg g[data-entity-id="iface:svi"]')).toHaveAttribute('transform', 'translate(680 40)')
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Use dark theme', exact: true }).click()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/files-${theme}.png`, fullPage: true })
  }
  await page.evaluate(() => { Object.defineProperty(window, 'printCallsForTest', { value: 0, writable: true }); window.print = () => { (window as unknown as { printCallsForTest: number }).printCallsForTest++ } })
  await page.getByRole('button', { name: 'Print / save PDF', exact: true }).click()
  expect(await page.evaluate(() => (window as unknown as { printCallsForTest: number }).printCallsForTest)).toBe(1)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.file-controls')).toBeHidden()
  await expect(page.locator('.sidebar')).toBeHidden()
  expect(await report.evaluate((element) => element.getBoundingClientRect().width >= document.documentElement.clientWidth * .9)).toBe(true)
  const pdf = await page.pdf({ path: 'test-results/netscratch-report.pdf', preferCSSPageSize: true, printBackground: true })
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
  expect(pdf.byteLength).toBeGreaterThan(5000)
  await page.emulateMedia({ media: 'screen' })
  await page.getByLabel('Enlarge diagrams across four pages each', { exact: true }).check()
  await expect(report.locator('svg')).toHaveCount(8)
  await page.emulateMedia({ media: 'print' })
  await page.pdf({ path: 'test-results/netscratch-tiled-report.pdf', preferCSSPageSize: true, printBackground: true })
  await page.emulateMedia({ media: 'screen' })
  await page.getByLabel('Enlarge diagrams across four pages each', { exact: true }).uncheck()
  for (const width of [320, 390, 600, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.screenshot({ path: 'test-results/files-mobile.png', fullPage: true })
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('large reports paginate port schedules and long writing without clipping the document', async ({ page }) => {
  const project = fixture()
  for (let index = 0; index < 12; index++) {
    const id = `switch-${index}`
    project.devices.push({ id, name: `Access switch ${index}`, role: 'switch', hardwareItemId: null, scope: 'HQ', notes: '' })
    project.layout.physical[id] = { x: index % 3 * 340, y: 300 + Math.floor(index / 3) * 1200 }
    for (let number = 0; number < 24; number++) project.ports.push({ id: `${id}-port-${number}`, deviceId: id, name: `Gi0/${number}`, speed: '1 Gbps', media: 'copper', mode: 'unused', accessVlanId: null, trunkVlanIds: [] })
  }
  project.notes.push({ id: 'long-note', text: 'LongUnbrokenImplementationNote'.repeat(100) + '\nEND-OF-LONG-NOTE' })
  await page.goto('/')
  await page.evaluate(async (project) => { const url = '/src/state/projectStore.ts'; (await import(url)).useProjectStore.getState().openProject(project) }, project)
  await openFiles(page)
  await page.emulateMedia({ media: 'print' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.pdf({ path: 'test-results/netscratch-large-report.pdf', preferCSSPageSize: true, printBackground: true })
  await expect(page.locator('.print-report')).toContainText('END-OF-LONG-NOTE')
})
