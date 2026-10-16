import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Project } from '../src/core/schema'

async function readProject(page: Page): Promise<Project> {
  return page.evaluate(async () => { const url = '/src/state/projectStore.ts'; return (await import(url)).useProjectStore.getState().project })
}

async function openLogical(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    const url = '/src/state/projectStore.ts'
    const { useProjectStore } = await import(url)
    const project = structuredClone(useProjectStore.getState().project)
    project.vlans = [{ id: 'staff', number: 10, name: 'Staff' }, { id: 'guest', number: 20, name: 'Guest' }]
    project.addressSpaces = [{ id: 'space', name: 'Office', parentCidr: '10.0.0.0/16', scope: 'HQ' }]
    project.subnets = ['assigned', 'unassigned'].map((id, index) => ({ id, name: id, addressSpaceId: 'space', cidr: `10.0.${index}.0/24`, status: 'allocated', hostRequirement: 10, gatewayIp: null, vlanId: id === 'assigned' ? 'staff' : null, source: 'manual', notes: '' }))
    project.devices = [{ id: 'router', name: 'Router', role: 'router', hardwareItemId: null, scope: 'HQ', notes: '' }]
    project.ports = [{ id: 'port', deviceId: 'router', name: 'eth0', speed: '1 Gbps', media: 'copper', mode: 'routed', accessVlanId: null, trunkVlanIds: [] }]
    project.interfaces = [
      { id: 'physical', name: 'WAN', deviceId: 'router', kind: 'physical', portId: 'port', vlanId: 'staff', address: '10.0.0.1/24' },
      { id: 'guest-iface', name: 'Guest SVI', deviceId: 'router', kind: 'SVI', portId: null, vlanId: 'guest', address: null },
      { id: 'loopback', name: 'Loopback', deviceId: 'router', kind: 'loopback', portId: null, vlanId: null, address: '10.255.0.1/32' },
    ]
    project.layout.physical = { router: { x: 20, y: 30 } }
    useProjectStore.getState().replaceProject(project)
  })
  await page.getByRole('button', { name: '04 Logical', exact: true }).click()
}

test('logical membership renders without missing handles and saves mouse and keyboard positions', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.text().includes("Couldn't create edge")) errors.push(message.text()) })
  await openLogical(page)
  await page.getByRole('button', { name: 'Fit view', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(7)
  await expect(page.locator('.react-flow__edge')).toHaveCount(3)
  await page.getByLabel('Inspect Interface', { exact: true }).selectOption('loopback')
  await expect(page.getByRole('heading', { name: 'Interface: Loopback', exact: true })).toBeVisible()
  await expect(page.locator('.react-flow__node-interface').filter({ hasText: 'Loopback' })).toBeVisible()
  await page.locator('.react-flow__node[data-id="iface:loopback"]').getByRole('button', { name: 'Inspect interface', exact: true }).click()
  await page.getByLabel('Inspect VLAN', { exact: true }).selectOption('staff')
  const beforePhysical = (await readProject(page)).layout.physical
  const header = page.locator('.vlan-drag').filter({ hasText: 'VLAN 10' })
  const box = (await header.boundingBox())!
  await page.mouse.move(box.x + 60, box.y + 30)
  await page.mouse.down()
  await page.mouse.move(box.x + 140, box.y + 100, { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => (await readProject(page)).layout.logical['vlan:staff']).toBeDefined()
  const beforeKey = (await readProject(page)).layout.logical['vlan:staff']!
  const node = page.locator('.react-flow__node[data-id="vlan:staff"]')
  await node.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await readProject(page)).layout.logical['vlan:staff']!.x).toBeGreaterThan(beforeKey.x)
  const positions = (await readProject(page)).layout.logical
  await page.getByRole('button', { name: '06 Notes', exact: true }).click()
  await page.getByRole('button', { name: '04 Logical', exact: true }).click()
  expect((await readProject(page)).layout.logical).toEqual(positions)
  expect((await readProject(page)).layout.physical).toEqual(beforePhysical)
  await page.getByLabel('Inspect Subnet', { exact: true }).selectOption('unassigned')
  await page.locator('.react-flow__node[data-id="subnet:unassigned"]').getByRole('button', { name: 'Inspect subnet', exact: true }).click()
  await page.getByLabel('Assign to VLAN', { exact: true }).selectOption('guest')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  expect((await readProject(page)).subnets.find((subnet) => subnet.id === 'unassigned')!.vlanId).toBe('guest')
  await page.getByRole('button', { name: 'Fit view', exact: true }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(4)
  await page.getByRole('button', { name: 'Inspect VLAN 10', exact: true }).click()
  await expect(page.getByLabel('VLAN number', { exact: true })).toHaveValue('10')
  await page.getByLabel('Inspect Interface', { exact: true }).selectOption('physical')
  await page.getByLabel('IP address / prefix', { exact: true }).fill('10.0.0.2/24')
  await page.getByRole('button', { name: 'Apply interface', exact: true }).click()
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click()
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click()
  expect(errors).toEqual([])
})

test('logical view, nodes, and editors pass axe and reflow in both themes', async ({ page }) => {
  await openLogical(page)
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Use dark theme', exact: true }).click()
    await page.getByRole('button', { name: 'Fit view', exact: true }).click()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/logical-${theme}.png`, fullPage: true })
    await page.getByLabel('Inspect VLAN', { exact: true }).selectOption('staff')
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByLabel('Inspect Subnet', { exact: true }).selectOption('assigned')
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByLabel('Inspect Interface', { exact: true }).selectOption('physical')
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  }
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.screenshot({ path: 'test-results/logical-mobile.png', fullPage: true })
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
