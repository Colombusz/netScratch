import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore as store } from './projectStore'
import { createEmptyProject } from '../core/schema'

beforeEach(() => store.getState().openProject(createEmptyProject('Start')))
describe('project transaction history', () => {
  it('undoes and redoes a complete device deletion including attached records and positions', () => {
    const id = store.getState().addDevice({ name: 'Core', role: 'switch', scope: 'HQ' }, { x: 10, y: 20 })
    store.getState().addPorts(id, [{ name: 'eth0', speed: '1 Gbps', media: 'copper' }])
    store.getState().addNote({ text: 'Keep this note', attachedTo: { entityType: 'device', id } })
    const original = store.getState().project
    store.getState().deleteDevice(id)
    expect(store.getState().project.notes[0]!.attachedTo).toBeUndefined()
    store.getState().undo()
    expect(store.getState().project).toEqual({ ...original, updatedAt: expect.any(String) })
    store.getState().redo()
    expect(store.getState().project.devices).toEqual([])
    expect(store.getState().project.ports).toEqual([])
  })
  it('clears redo on a new edit, ignores same-name blur, and does not record invalid transactions', () => {
    store.getState().renameProject('Next'); store.getState().undo()
    const count = store.getState().past.length
    store.getState().renameProject('Start'); expect(store.getState().past).toHaveLength(count)
    expect(() => store.getState().renameProject('')).toThrow()
    expect(store.getState().past).toHaveLength(count)
    store.getState().renameProject('Branch'); expect(store.getState().future).toEqual([])
  })
  it('bounds history to 50 and starts fresh for an opened document, without making history portable', () => {
    for (let i = 0; i < 55; i++) store.getState().renameProject(`Edit ${i}`)
    expect(store.getState().past).toHaveLength(50)
    const epoch = store.getState().openedEpoch
    store.getState().undo(); expect(store.getState().openedEpoch).toBe(epoch)
    store.getState().openProject(createEmptyProject('Other'))
    expect(store.getState().past).toEqual([]); expect(store.getState().future).toEqual([])
    store.getState().undo(); store.getState().redo(); expect(store.getState().project.name).toBe('Other')
    expect(store.getState().openedEpoch).toBe(epoch + 1)
  })
})
