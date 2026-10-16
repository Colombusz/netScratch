import { create } from 'zustand'
import { createLocalProject, PROJECT_KEY, type SaveState } from '../storage/localProject'
import { useProjectStore } from './projectStore'
import { useTopologyUiStore } from './topologyUiStore'

export const usePersistenceStore = create<SaveState>(() => ({ status: 'error', message: 'Browser saving has not started. Export JSON to keep a copy.' }))

export const localProject = createLocalProject({
  storage: {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  },
  restore: (project) => { useProjectStore.getState().openProject(project); useTopologyUiStore.getState().select(null) },
  status: (state) => usePersistenceStore.setState({ recoveryRaw: undefined, paused: false, ...state }),
})

export function startPersistence() {
  localProject.start(useProjectStore.getState().project)
  const unsubscribe = useProjectStore.subscribe((state, previous) => { if (state.project !== previous.project) localProject.save(state.project) })
  const listener = (event: StorageEvent) => { if (event.key === PROJECT_KEY || event.key === null) localProject.externalChange(event.newValue) }
  window.addEventListener('storage', listener)
  return () => { unsubscribe(); window.removeEventListener('storage', listener) }
}
