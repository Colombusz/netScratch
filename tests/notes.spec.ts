import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Project } from '../src/core/schema'

async function readProject(page: Page): Promise<Project> {
  return page.evaluate(async () => {
    const url = '/src/state/projectStore.ts'
    return (await import(url)).useProjectStore.getState().project
  })
}

async function openNotes(page: Page, seed = true) {
  await page.goto('/')
  if (seed) await page.evaluate(async () => {
    const url = '/src/state/projectStore.ts'
    const { useProjectStore } = await import(url)
    const deviceId = useProjectStore.getState().addDevice({ name: 'Edge router', role: 'router', scope: 'HQ' }, { x: 0, y: 0 })
    useProjectStore.getState().addPorts(deviceId, [{ name: 'eth0', speed: '1 Gbps', media: 'copper' }])
    const project = structuredClone(useProjectStore.getState().project)
    project.addressSpaces.push({ id: 'space', name: 'Office', parentCidr: '10.0.0.0/24', scope: 'HQ' })
    project.subnets.push({ id: 'staff', addressSpaceId: 'space', name: 'Staff', cidr: '10.0.0.0/25', status: 'allocated', hostRequirement: 100, gatewayIp: '10.0.0.1', vlanId: null, source: 'manual', notes: '' })
    useProjectStore.getState().replaceProject(project)
  })
  await page.getByRole('button', { name: '06 Notes', exact: true }).click()
}

async function addNote(page: Page, text: string, target?: string) {
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  await expect(page.getByLabel('Note text', { exact: true })).toBeFocused()
  await page.getByLabel('Note text', { exact: true }).fill(text)
  if (target) await page.getByLabel('Attach to', { exact: true }).selectOption({ label: target })
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
}

async function addTask(page: Page, text: string, target?: string) {
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.getByLabel('Task', { exact: true }).fill(text)
  if (target) await page.getByLabel('Attach to', { exact: true }).selectOption({ label: target })
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
}

test('notes and tasks support CRUD, attachments, filters, status changes and keyboard editing', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openNotes(page)
  await expect(page.getByText('No notes yet.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Write a note')
  expect((await readProject(page)).notes).toHaveLength(0)
  await page.getByLabel('Note text', { exact: true }).press('Escape')
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeFocused()
  await addNote(page, 'Confirm uplink\nKeep the current addressing plan.', 'Device: Edge router (HQ)')
  const noteId = (await readProject(page)).notes[0]!.id
  await addNote(page, 'Project assumptions')
  await page.getByRole('button', { name: 'Edit note 1', exact: true }).click()
  await page.getByLabel('Note text', { exact: true }).fill('Verify uplink')
  await page.getByLabel('Attach to', { exact: true }).selectOption({ label: 'Subnet: Staff (10.0.0.0/25)' })
  await page.getByRole('button', { name: 'Apply note', exact: true }).click()
  expect((await readProject(page)).notes[0]!.id).toBe(noteId)
  await page.getByLabel('Show attachments', { exact: true }).selectOption({ label: 'Subnet: Staff (10.0.0.0/25)' })
  await expect(page.getByRole('heading', { name: 'Notes (1)', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByLabel('Task', { exact: true }).fill('Verify gateway')
  await page.getByLabel('Task', { exact: true }).press('Enter')
  expect((await readProject(page)).checklistItems[0]!.attachedTo?.id).toBe('staff')
  const taskId = (await readProject(page)).checklistItems[0]!.id
  await page.getByLabel('Status for task 1', { exact: true }).selectOption('doing')
  await expect(page.getByRole('status')).toHaveText('Task status changed to Doing.')
  await page.getByLabel('Show task status', { exact: true }).selectOption('doing')
  await page.getByLabel('Status for task 1', { exact: true }).selectOption('done')
  await expect(page.getByText('No tasks match these filters.', { exact: false })).toBeVisible()
  await expect(page.getByLabel('Show task status', { exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(page.getByText('1 of 1 project tasks done.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit task 1', exact: true }).click()
  await page.getByLabel('Task', { exact: true }).fill('Confirm firewall')
  await page.getByLabel('Task status', { exact: true }).selectOption('todo')
  await page.getByLabel('Attach to', { exact: true }).selectOption({ label: 'Device: Edge router (HQ)' })
  await page.getByRole('button', { name: 'Apply task', exact: true }).click()
  expect((await readProject(page)).checklistItems[0]).toMatchObject({ id: taskId, task: 'Confirm firewall', status: 'todo' })
  await page.getByRole('button', { name: 'Edit task 1', exact: true }).click()
  await page.getByLabel('Task', { exact: true }).fill('Discard this change')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect((await readProject(page)).checklistItems[0]!.task).toBe('Confirm firewall')
  await page.getByLabel('Search notes and tasks', { exact: true }).fill('uplink')
  await expect(page.getByRole('heading', { name: 'Notes (1)', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit note 1', exact: true }).click()
  await page.getByLabel('Note text', { exact: true }).fill('Changed decision')
  await page.getByLabel('Attach to', { exact: true }).selectOption('')
  await page.getByRole('button', { name: 'Apply note', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeFocused()
  await expect(page.getByText('No notes match these filters.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await page.getByLabel('Show attachments', { exact: true }).selectOption('project')
  await expect(page.getByRole('heading', { name: 'Notes (2)', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  const snapshot = await readProject(page)
  await page.getByRole('button', { name: '01 Calculator', exact: true }).click()
  await page.getByRole('button', { name: '06 Notes', exact: true }).click()
  expect(await readProject(page)).toEqual(snapshot)
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Delete note 1', exact: true }).click()
  expect((await readProject(page)).notes).toHaveLength(2)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete note 1', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeFocused()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Delete task 1', exact: true }).click()
  expect((await readProject(page)).checklistItems).toHaveLength(1)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete task 1', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add task', exact: true })).toBeFocused()
  expect(errors).toEqual([])
})

test('deleting device and subnet targets preserves writing, and related notes detach on deletion', async ({ page }) => {
  await openNotes(page)
  await addNote(page, 'Device handoff', 'Device: Edge router (HQ)')
  await addTask(page, 'Confirm install', 'Device: Edge router (HQ)')
  await page.getByRole('button', { name: '03 Physical', exact: true }).click()
  await page.getByLabel('Inspect device', { exact: true }).selectOption({ label: 'Edge router (HQ)' })
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete device', exact: true }).click()
  await page.getByRole('button', { name: '06 Notes', exact: true }).click()
  const project = await readProject(page)
  expect(project.notes[0]!.attachedTo).toBeUndefined()
  expect(project.checklistItems[0]!.attachedTo).toBeUndefined()
  await expect(page.getByText('Whole project (unattached)', { exact: true })).toHaveCount(2)
  await addNote(page, 'Subnet handoff', 'Subnet: Staff (10.0.0.0/25)')
  await page.evaluate(async () => {
    const storeUrl = '/src/state/projectStore.ts'
    const planningUrl = '/src/core/planning.ts'
    const { useProjectStore } = await import(storeUrl)
    const { applyPlan } = await import(planningUrl)
    const p = useProjectStore.getState().project
    useProjectStore.getState().replaceProject(applyPlan(p, p.addressSpaces[0], []))
  })
  expect((await readProject(page)).notes[1]!.attachedTo).toBeUndefined()
  await addTask(page, 'Related handoff', 'Note: Device handoff')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete note 1', exact: true }).click()
  expect((await readProject(page)).checklistItems[1]!.attachedTo).toBeUndefined()
})

test('notes remain plain text and pass responsive and accessibility checks in both themes', async ({ page }) => {
  await openNotes(page)
  await addNote(page, '<script>window.fake = true</script>\n' + 'LongUnbrokenNetworkDecision'.repeat(12), 'Device: Edge router (HQ)')
  await addTask(page, 'Verify the gateway and confirm the installation plan', 'Subnet: Staff (10.0.0.0/25)')
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Use dark theme', exact: true }).click()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/notes-${theme}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Edit note 1', exact: true }).click()
    await expect(page.getByLabel('Note text', { exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Attach to', { exact: true })).toBeFocused()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByLabel('Note text', { exact: true }).press('Escape')
    await page.getByRole('button', { name: 'Edit task 1', exact: true }).click()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  }
  expect(await page.evaluate(() => 'fake' in window)).toBe(false)
  await page.getByRole('button', { name: 'Use light theme', exact: true }).click()
  for (const width of [320, 390, 600, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Add note', exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByLabel('Note text', { exact: true }).press('Escape')
  }
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.screenshot({ path: 'test-results/notes-mobile.png', fullPage: true })
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
