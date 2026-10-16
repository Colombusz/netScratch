import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Project } from '../src/core/schema'

async function readProject(page: Page): Promise<Project> {
  return page.evaluate(async () => {
    const url = '/src/state/projectStore.ts'
    return (await import(url)).useProjectStore.getState().project
  })
}

async function createVlan(page: Page) {
  await page.getByRole('button', { name: '04 Logical', exact: true }).click()
  await page.getByRole('button', { name: 'Add VLAN', exact: true }).click()
  await page.getByLabel('New VLAN number', { exact: true }).fill('10')
  await page.getByLabel('New VLAN name', { exact: true }).fill('Staff')
  await page.getByRole('button', { name: 'Save VLAN', exact: true }).click()
}

async function openDevice(page: Page) {
  await page.getByRole('button', { name: '03 Physical', exact: true }).click()
  await page.getByRole('region', { name: 'Device palette' }).getByRole('button', { name: 'Router', exact: true }).click()
  await page.getByLabel('Device name', { exact: true }).fill('Edge')
  await page.getByRole('button', { name: 'Apply device', exact: true }).click()
  await page.getByRole('button', { name: 'Add port', exact: true }).click()
}

async function addInterface(page: Page, name: string, kind: string, address: string) {
  await page.getByRole('button', { name: 'Add interface', exact: true }).click()
  await expect(page.getByLabel('Interface name', { exact: true })).toBeFocused()
  await page.getByLabel('Interface name', { exact: true }).fill(name)
  await page.getByLabel('Interface kind', { exact: true }).selectOption(kind)
  if (kind === 'physical') await page.getByLabel('Physical port', { exact: true }).selectOption({ label: 'Gi0/1' })
  await page.getByLabel('Interface VLAN', { exact: true }).selectOption({ label: '10: Staff' })
  await page.getByLabel('Interface address / prefix', { exact: true }).fill(address)
  await page.getByRole('button', { name: 'Save interface', exact: true }).click()
}

test('creates VLANs and ranges and manages every interface kind in the physical inspector', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await createVlan(page)
  await page.getByRole('button', { name: 'Add VLAN', exact: true }).click()
  await page.getByRole('button', { name: 'Save VLAN', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('already exists')
  await page.getByRole('button', { name: 'VLAN range', exact: true }).click()
  await page.getByRole('button', { name: 'Save VLAN range', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Enter a start number')
  await page.getByLabel('VLAN name prefix', { exact: true }).fill('Site ')
  await page.getByLabel('Start VLAN number', { exact: true }).fill('20')
  await page.getByLabel('VLAN count', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Save VLAN range', exact: true }).click()
  expect((await readProject(page)).vlans.map((vlan) => vlan.number)).toEqual([10, 20, 21])
  await page.getByRole('button', { name: 'Add VLAN', exact: true }).click()
  await page.getByRole('button', { name: 'One VLAN', exact: true }).click()
  await page.getByLabel('New VLAN number', { exact: true }).press('Escape')
  await expect(page.getByRole('button', { name: 'Add VLAN', exact: true })).toBeFocused()
  await openDevice(page)
  await page.getByRole('button', { name: 'Add interface', exact: true }).click()
  await page.getByRole('button', { name: 'Save interface', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByLabel('Interface name', { exact: true }).fill('WAN')
  await page.getByRole('button', { name: 'Save interface', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('requires a port')
  await page.getByLabel('Physical port', { exact: true }).selectOption({ label: 'Gi0/1' })
  await page.getByLabel('Interface address / prefix', { exact: true }).fill('bad address')
  await page.getByRole('button', { name: 'Save interface', exact: true }).click()
  expect((await readProject(page)).interfaces).toHaveLength(0)
  await page.getByLabel('Interface address / prefix', { exact: true }).fill('192.168.10.1/24')
  await page.getByLabel('Interface VLAN', { exact: true }).selectOption({ label: '10: Staff' })
  await page.getByRole('button', { name: 'Save interface', exact: true }).click()
  const id = (await readProject(page)).interfaces[0]!.id
  await page.getByRole('button', { name: 'Add interface', exact: true }).click()
  await page.getByLabel('Interface name', { exact: true }).fill('Duplicate')
  await page.getByLabel('Physical port', { exact: true }).selectOption({ label: 'Gi0/1' })
  await page.getByRole('button', { name: 'Save interface', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('already has a physical interface')
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click()
  await page.getByRole('button', { name: 'Edit interface WAN', exact: true }).click()
  await page.getByLabel('Interface kind', { exact: true }).selectOption('loopback')
  await page.getByLabel('Interface address / prefix', { exact: true }).fill('10.255.0.1/32')
  await page.getByLabel('Interface VLAN', { exact: true }).selectOption('')
  await page.getByLabel('Interface address / prefix', { exact: true }).press('Enter')
  expect((await readProject(page)).interfaces[0]).toMatchObject({ id, kind: 'loopback', portId: null, vlanId: null, address: '10.255.0.1/32' })
  await addInterface(page, 'LAN', 'physical', '192.168.20.1/24')
  await addInterface(page, 'Vlan10', 'SVI', '192.168.30.1/24')
  await addInterface(page, 'eth0.10', 'subinterface', '')
  expect((await readProject(page)).interfaces).toHaveLength(4)
  await page.getByRole('button', { name: 'Edit interface Vlan10', exact: true }).click()
  await page.getByLabel('Interface name', { exact: true }).fill('Discarded')
  await page.getByLabel('Interface name', { exact: true }).press('Escape')
  await expect(page.getByRole('button', { name: 'Edit interface Vlan10', exact: true })).toBeFocused()
  const snapshot = await readProject(page)
  await page.getByRole('button', { name: '06 Notes', exact: true }).click()
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  await page.getByLabel('Note text', { exact: true }).fill('Keep interface handoff')
  await page.getByLabel('Attach to', { exact: true }).selectOption({ label: 'Interface: Edge / Vlan10' })
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await page.getByRole('button', { name: '03 Physical', exact: true }).click()
  await page.getByLabel('Inspect device', { exact: true }).selectOption(snapshot.devices[0]!.id)
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Delete interface Vlan10', exact: true }).click()
  expect((await readProject(page)).interfaces).toHaveLength(4)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete interface Vlan10', exact: true }).click()
  expect((await readProject(page)).interfaces).toHaveLength(3)
  expect((await readProject(page)).notes[0]!.attachedTo).toBeUndefined()
  await expect(page.getByRole('button', { name: 'Add interface', exact: true })).toBeFocused()
  expect(errors).toEqual([])
})

test('interface forms and VLAN creation support keyboard access, themes, and mobile reflow', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '04 Logical', exact: true }).click()
  await page.getByRole('button', { name: 'Add VLAN', exact: true }).click()
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Use dark theme', exact: true }).click()
    expect((await new AxeBuilder({ page }).include('.vlan-creator').analyze()).violations).toEqual([])
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await openDevice(page)
  await page.getByRole('button', { name: 'Add interface', exact: true }).click()
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Use light theme', exact: true }).click()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  }
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.screenshot({ path: 'test-results/interface-mobile.png', fullPage: true })
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
