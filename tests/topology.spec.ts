import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Project } from '../src/core/schema'

async function readProject(page: Page): Promise<Project> {
  return page.evaluate(async () => {
    const url = '/src/state/projectStore.ts'
    return (await import(url)).useProjectStore.getState().project
  })
}

async function openTopology(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '03 Physical', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Physical topology', exact: true })).toBeVisible()
}

async function addDevice(page: Page, role: string, name: string, count: number, x: number, y: number) {
  await page.getByRole('region', { name: 'Device palette' }).getByRole('button', { name: role, exact: true }).click()
  await page.getByLabel('Device name', { exact: true }).fill(name)
  await page.getByRole('button', { name: 'Apply device', exact: true }).click()
  await page.getByLabel('X position').fill(String(x))
  await page.getByLabel('Y position').fill(String(y))
  await page.getByRole('button', { name: 'Apply position', exact: true }).click()
  await page.getByRole('button', { name: 'Port range', exact: true }).click()
  await page.getByLabel('Port count', { exact: true }).fill(String(count))
  await page.getByRole('button', { name: 'Add port range', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: `${count} ports added to ${name}.` })).toBeVisible()
}

async function connect(page: Page, from: string, to: string, label: string) {
  await page.getByRole('button', { name: 'New cable', exact: true }).click()
  await page.getByLabel('End A', { exact: true }).selectOption({ label: from })
  await page.getByLabel('End B', { exact: true }).selectOption({ label: to })
  await page.getByLabel('Cable label', { exact: true }).fill(label)
  await page.getByRole('button', { name: 'Connect ports', exact: true }).click()
}

test('builds and edits a small office using one project document', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.text().includes("Couldn't create edge")) errors.push(message.text()) })
  await openTopology(page)
  await expect(page).toHaveTitle(/netScratch/)
  await addDevice(page, 'Router', 'Edge router', 1, 40, 60)
  await addDevice(page, 'Firewall', 'Office firewall', 3, 420, 60)
  await addDevice(page, 'Switch', 'Staff switch', 3, 40, 400)
  await addDevice(page, 'Switch', 'Guest switch', 3, 420, 400)
  await addDevice(page, 'Endpoint', 'Workstation', 1, 40, 750)
  await addDevice(page, 'Endpoint', 'Guest PC', 1, 420, 750)
  await connect(page, 'Edge router / Gi0/1', 'Office firewall / Gi0/1', 'Internet handoff')
  await connect(page, 'Office firewall / Gi0/2', 'Staff switch / Gi0/1', 'Staff uplink')
  await connect(page, 'Office firewall / Gi0/3', 'Guest switch / Gi0/1', 'Guest uplink')
  await connect(page, 'Staff switch / Gi0/2', 'Workstation / Gi0/1', 'Desk 01')
  await connect(page, 'Guest switch / Gi0/2', 'Guest PC / Gi0/1', 'Guest desk')
  let project = await readProject(page)
  expect(project.devices).toHaveLength(6)
  expect(project.links).toHaveLength(5)
  expect(project.ports).toHaveLength(12)
  const router = project.devices.find((device) => device.name === 'Edge router')!
  const linkIds = project.links.map((link) => link.id)
  await page.getByLabel('Inspect device', { exact: true }).selectOption(router.id)
  await page.getByLabel('Device name', { exact: true }).fill('WAN router')
  await page.getByRole('button', { name: 'Apply device', exact: true }).click()
  await page.getByRole('button', { name: 'Gi0/1 1 Gbps', exact: true }).click()
  await page.getByLabel('Port name', { exact: true }).fill('WAN0')
  await page.getByLabel('Port speed', { exact: true }).fill('10 Gbps')
  await page.getByLabel('Media', { exact: true }).selectOption('fiber')
  await page.getByRole('button', { name: 'Apply port', exact: true }).click()
  await page.getByRole('button', { name: 'Inspect cable', exact: true }).click()
  await page.getByLabel('Cable type', { exact: true }).fill('Single-mode fiber')
  await page.getByLabel('Cable label', { exact: true }).fill('ISP circuit')
  await page.getByRole('button', { name: 'Apply cable', exact: true }).click()
  project = await readProject(page)
  expect(project.devices.find((device) => device.id === router.id)?.name).toBe('WAN router')
  expect(project.links.map((link) => link.id)).toEqual(linkIds)
  expect(project.links[0]?.cableType).toBe('Single-mode fiber')
  expect(project.layout.physical[router.id]).toEqual({ x: 40, y: 60 })
  const beforeNavigation = structuredClone(project)
  await page.getByRole('button', { name: '01 Calculator', exact: true }).click()
  await page.getByRole('button', { name: '03 Physical', exact: true }).click()
  expect(await readProject(page)).toEqual(beforeNavigation)
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click()
  await page.getByRole('button', { name: 'Fit view', exact: true }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(5)
  await page.screenshot({ path: 'test-results/topology-office.png', fullPage: true })
  expect(errors).toEqual([])
})

test('drags from the palette, moves devices, and connects actual port handles', async ({ page }) => {
  await openTopology(page)
  const canvas = page.locator('.topology-canvas')
  const box = (await canvas.boundingBox())!
  const palette = page.getByRole('region', { name: 'Device palette' })
  const transfer = await page.evaluateHandle(() => new DataTransfer())
  await palette.getByRole('button', { name: 'Router', exact: true }).dispatchEvent('dragstart', { dataTransfer: transfer })
  await canvas.dispatchEvent('drop', { dataTransfer: transfer, clientX: box.x + 90, clientY: box.y + 100 })
  await page.getByRole('button', { name: 'Add port', exact: true }).click()
  await addDevice(page, 'Switch', 'Core', 2, 500, 60)
  await page.getByRole('button', { name: 'Fit view', exact: true }).click()
  const from = page.getByLabel('Cable handle for Router 1 Gi0/1', { exact: true })
  const to = page.getByLabel('Cable handle for Core Gi0/1', { exact: true })
  await expect(from).toBeVisible()
  await expect(to).toBeVisible()
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 })
  await page.mouse.up()
  await expect(page.getByRole('heading', { name: 'Cable inspector', exact: true })).toBeVisible()
  expect((await readProject(page)).links).toHaveLength(1)
  await page.getByLabel('Cable label', { exact: true }).fill('Physical uplink')
  await page.getByRole('button', { name: 'Apply cable', exact: true }).click()
  await expect(page.locator('.react-flow__edge-text')).toContainText('Physical uplink')
  const router = (await readProject(page)).devices.find((device) => device.role === 'router')!
  const before = (await readProject(page)).layout.physical[router.id]!
  const header = page.locator('.device-drag').filter({ hasText: 'Router 1' })
  const headerBox = (await header.boundingBox())!
  await page.mouse.move(headerBox.x + 80, headerBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(headerBox.x + 160, headerBox.y + 90, { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => (await readProject(page)).layout.physical[router.id]).not.toEqual(before)
  const after = (await readProject(page)).layout.physical[router.id]
  await page.getByRole('button', { name: '02 Planner', exact: true }).click()
  await page.getByRole('button', { name: '03 Physical', exact: true }).click()
  expect((await readProject(page)).layout.physical[router.id]).toEqual(after)
})

test('bulk ports, rejection, grouping, and cascading deletion remain atomic', async ({ page }) => {
  await openTopology(page)
  await page.getByRole('button', { name: 'New cable', exact: true }).click()
  await expect(page.getByText('Add at least two free named ports')).toBeVisible()
  await addDevice(page, 'Switch', 'Access', 24, 20, 40)
  await page.getByRole('button', { name: 'Add port range', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('already exists')
  expect((await readProject(page)).ports).toHaveLength(24)
  await addDevice(page, 'Endpoint', 'Desk', 1, 500, 50)
  await connect(page, 'Access / Gi0/1', 'Desk / Gi0/1', 'Desk cable')
  const access = (await readProject(page)).devices.find((device) => device.name === 'Access')!
  await page.getByLabel('Inspect device', { exact: true }).selectOption(access.id)
  await page.getByLabel('Site / routing scope', { exact: true }).fill('Server room')
  await page.getByRole('button', { name: 'Apply device', exact: true }).click()
  await page.getByRole('button', { name: 'Fit view', exact: true }).click()
  await expect(page.getByText('Site: Server room', { exact: true })).toBeVisible()
  const before = await readProject(page)
  await page.getByLabel('Show site outlines').uncheck()
  expect(await readProject(page)).toEqual(before)
  await expect(page.locator('.react-flow__node-site')).toHaveCount(0)
  await page.getByLabel('Show site outlines').check()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Arrange by site', exact: true }).click()
  expect((await readProject(page)).layout.physical).not.toEqual(before.layout.physical)
  await page.getByRole('button', { name: 'Gi0/2 1 Gbps', exact: true }).click()
  await page.getByLabel('Port name', { exact: true }).fill('Gi0/1')
  await page.getByRole('button', { name: 'Apply port', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('already exists')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Delete device', exact: true }).click()
  expect((await readProject(page)).devices).toHaveLength(2)
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('24 ports and 1 cables'); await dialog.accept() })
  await page.getByRole('button', { name: 'Delete device', exact: true }).click()
  const remaining = await readProject(page)
  expect(remaining.devices).toHaveLength(1)
  expect(remaining.ports).toHaveLength(1)
  expect(remaining.links).toHaveLength(0)
  expect(remaining.layout.physical[access.id]).toBeUndefined()
})

test('port and cable inspectors support rewiring, deletion, and keyboard controls', async ({ page }) => {
  await openTopology(page)
  await addDevice(page, 'Switch', 'Switch A', 3, 20, 40)
  await addDevice(page, 'Server', 'Server A', 1, 500, 40)
  await connect(page, 'Switch A / Gi0/1', 'Server A / Gi0/1', 'Server link')
  await page.getByLabel('End A', { exact: true }).selectOption({ label: 'Switch A / Gi0/2' })
  await page.getByRole('button', { name: 'Apply cable', exact: true }).click()
  let project = await readProject(page)
  expect(project.ports.find((port) => port.id === project.links[0]!.sourcePortId)?.name).toBe('Gi0/2')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete cable', exact: true }).click()
  expect((await readProject(page)).links).toHaveLength(0)
  await page.getByLabel('Inspect device', { exact: true }).selectOption({ label: 'Switch A (Main site)' })
  await page.getByRole('button', { name: 'Gi0/1 1 Gbps', exact: true }).click()
  await page.getByRole('button', { name: 'Connect this port', exact: true }).click()
  await page.getByLabel('End B', { exact: true }).selectOption({ label: 'Server A / Gi0/1' })
  await page.getByLabel('Cable type', { exact: true }).fill('Cat6A')
  await page.getByLabel('Cable label', { exact: true }).fill('Reconnected')
  await page.getByLabel('Cable label', { exact: true }).press('Enter')
  await page.getByLabel('Inspect device', { exact: true }).selectOption({ label: 'Server A (Main site)' })
  await page.getByRole('button', { name: 'Gi0/1 1 Gbps', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete port', exact: true }).click()
  project = await readProject(page)
  expect(project.links).toHaveLength(0)
  expect(project.ports).toHaveLength(3)
  await page.getByRole('button', { name: 'One port', exact: true }).click()
  await page.getByLabel('Port name', { exact: true }).fill('eth0')
  await page.getByRole('button', { name: 'Add port', exact: true }).click()
  await page.getByLabel('Device name', { exact: true }).press('Escape')
  await expect(page.getByRole('heading', { name: 'Topology inspector', exact: true })).toBeVisible()
})

test('topology reflows on mobile and passes accessibility checks in both themes', async ({ page }) => {
  await openTopology(page)
  await addDevice(page, 'Router', 'Router A', 2, 20, 40)
  await page.getByRole('button', { name: 'Fit view', exact: true }).click()
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Use dark theme' }).click()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  }
  await page.screenshot({ path: 'test-results/topology-dark.png', fullPage: true })
  await page.getByRole('button', { name: 'Use light theme' }).click()
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.screenshot({ path: 'test-results/topology-mobile.png', fullPage: true })
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('hundreds of devices retain document data while offscreen nodes are culled', async ({ page }) => {
  await openTopology(page)
  await page.evaluate(async () => {
    const storeUrl = '/src/state/projectStore.ts'
    const schemaUrl = '/src/core/schema.ts'
    const { useProjectStore } = await import(storeUrl)
    const { createEmptyProject } = await import(schemaUrl)
    const project = createEmptyProject('Large topology')
    for (let index = 0; index < 350; index++) {
      const id = `device-${index}`
      project.devices.push({ id, name: `Switch ${index}`, role: 'switch', scope: `Site ${index % 5}`, hardwareItemId: null, notes: '' })
      project.layout.physical[id] = { x: index % 20 * 360, y: Math.floor(index / 20) * 1300 }
      for (let number = 1; number <= 24; number++) project.ports.push({ id: `${id}-port-${number}`, deviceId: id, name: `Gi0/${number}`, speed: '1 Gbps', media: 'copper', mode: 'unused', accessVlanId: null, trunkVlanIds: [] })
    }
    useProjectStore.getState().replaceProject(project)
  })
  await expect(page.getByText('350 devices · 8400 ports · 0 cables', { exact: true })).toBeVisible()
  await page.getByLabel('Inspect device', { exact: true }).selectOption('device-349')
  await expect(page.getByLabel('Device name', { exact: true })).toHaveValue('Switch 349')
  await expect.poll(() => page.locator('.react-flow__node-device').count()).toBeLessThan(30)
  await page.getByLabel('Device name', { exact: true }).fill('Last switch')
  await page.getByRole('button', { name: 'Apply device', exact: true }).click()
  const project = await readProject(page)
  expect(project.devices).toHaveLength(350)
  expect(project.ports).toHaveLength(8400)
  expect(project.devices.at(-1)?.name).toBe('Last switch')
  expect(JSON.stringify(project)).not.toMatch(/sourceHandle|targetHandle|react-flow|"measured"/)
})
