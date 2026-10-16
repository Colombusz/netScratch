import { create } from 'zustand'
import { createEmptyProject, projectSchema, type Project } from '../core/schema'
import * as topology from '../core/topology'
import * as logical from '../core/logical'
import * as hardware from '../core/hardware'
import * as notes from '../core/notes'

type ProjectState = {
  project: Project
  documentEpoch: number
  openedEpoch: number
  past: Project[]
  future: Project[]
  undo: () => void
  redo: () => void
  openProject: (project: Project) => void
  replaceProject: (project: Project) => void
  renameProject: (name: string) => void
  addDevice: (details: topology.DeviceDetails, position: topology.Position) => string
  updateDevice: (id: string, details: topology.DeviceDetails) => void
  moveDevices: (changes: { id: string; position: topology.Position }[]) => void
  addPorts: (deviceId: string, details: topology.PortDetails[]) => void
  addBulkPorts: (deviceId: string, details: topology.BulkPorts) => void
  updatePort: (id: string, details: topology.PortConfiguration) => void
  saveCable: (details: topology.CableDetails, id?: string) => string
  deleteDevice: (id: string) => void
  deletePort: (id: string) => void
  deleteCable: (id: string) => void
  addVlan: (details: logical.VlanDetails) => string
  addBulkVlans: (details: logical.BulkVlan) => void
  updateVlan: (id: string, details: logical.VlanDetails) => void
  deleteVlan: (id: string) => void
  addInterface: (deviceId: string, details: logical.InterfaceDetails) => string
  updateInterface: (id: string, details: logical.InterfaceDetails) => void
  deleteInterface: (id: string) => void
  assignSubnetToVlan: (subnetId: string, vlanId: string | null) => void
  addHardwareItem: (details: hardware.HardwareItemDetails) => void
  updateHardwareItem: (id: string, details: hardware.HardwareItemDetails) => void
  deleteHardwareItem: (id: string) => void
  addAllocation: (details: hardware.AllocationDetails) => void
  updateAllocation: (id: string, details: hardware.AllocationDetails) => void
  deleteAllocation: (id: string) => void
  addNote: (details: notes.NoteDetails) => void
  updateNote: (id: string, details: notes.NoteDetails) => void
  deleteNote: (id: string) => void
  addChecklistItem: (details: notes.ChecklistDetails) => void
  updateChecklistItem: (id: string, details: notes.ChecklistDetails) => void
  setChecklistStatus: (id: string, status: notes.ChecklistDetails['status']) => void
  deleteChecklistItem: (id: string) => void
  moveLogicalNodes: (positions: Project['layout']['logical']) => void
}

export const useProjectStore = create<ProjectState>((rawSet) => {
  const set = (update: Partial<ProjectState> | ((state: ProjectState) => Partial<ProjectState>)) => rawSet((state) => {
    const patch = typeof update === 'function' ? update(state) : update
    if (!patch.project || patch.project === state.project || patch.past !== undefined) return patch
    return { ...patch, past: [...state.past.slice(-49), state.project], future: [] }
  })
  return {
  project: createEmptyProject(),
  documentEpoch: 0,
  openedEpoch: 0,
  past: [], future: [],
  undo: () => rawSet((state) => state.past.length ? { project: { ...state.past.at(-1)!, updatedAt: new Date().toISOString() }, past: state.past.slice(0, -1), future: [state.project, ...state.future].slice(0, 50), documentEpoch: state.documentEpoch + 1 } : {}),
  redo: () => rawSet((state) => state.future.length ? { project: { ...state.future[0]!, updatedAt: new Date().toISOString() }, past: [...state.past, state.project].slice(-50), future: state.future.slice(1), documentEpoch: state.documentEpoch + 1 } : {}),
  openProject: (project) => set((state) => ({ project: projectSchema.parse(project), documentEpoch: state.documentEpoch + 1, openedEpoch: state.openedEpoch + 1, past: [], future: [] })),
  replaceProject: (project) => set({ project: projectSchema.parse(project) }),
  renameProject: (name) => set(({ project }) => name === project.name ? {} : ({
    project: projectSchema.parse({ ...project, name, updatedAt: new Date().toISOString() }),
  })),
  addDevice: (details, position) => {
    let id = ''
    set(({ project }) => {
      const next = topology.addDevice(project, details, position)
      id = next.devices.at(-1)!.id
      return { project: next }
    })
    return id
  },
  updateDevice: (id, details) => set(({ project }) => ({ project: topology.updateDevice(project, id, details) })),
  moveDevices: (changes) => set(({ project }) => ({ project: topology.moveDevices(project, changes) })),
  addPorts: (id, details) => set(({ project }) => ({ project: topology.addPorts(project, id, details) })),
  addBulkPorts: (id, details) => set(({ project }) => ({ project: topology.addBulkPorts(project, id, details) })),
  updatePort: (id, details) => set(({ project }) => ({ project: topology.updatePort(project, id, details) })),
  saveCable: (details, id) => {
    let savedId = ''
    set(({ project }) => {
      const next = topology.saveCable(project, details, id)
      savedId = id ?? next.links.at(-1)!.id
      return { project: next }
    })
    return savedId
  },
  deleteDevice: (id) => set(({ project }) => ({ project: topology.deleteDevice(project, id) })),
  deletePort: (id) => set(({ project }) => ({ project: topology.deletePort(project, id) })),
  deleteCable: (id) => set(({ project }) => ({ project: topology.deleteCable(project, id) })),
  addVlan: (details) => {
    let id = ''
    set(({ project }) => {
      const next = logical.addVlan(project, details)
      id = next.vlans.at(-1)!.id
      return { project: next }
    })
    return id
  },
  addBulkVlans: (details) => set(({ project }) => ({ project: logical.addBulkVlans(project, details) })),
  updateVlan: (id, details) => set(({ project }) => ({ project: logical.updateVlan(project, id, details) })),
  deleteVlan: (id) => set(({ project }) => ({ project: logical.deleteVlan(project, id) })),
  addInterface: (deviceId, details) => {
    let id = ''
    set(({ project }) => {
      const next = logical.addInterface(project, deviceId, details)
      id = next.interfaces.at(-1)!.id
      return { project: next }
    })
    return id
  },
  updateInterface: (id, details) => set(({ project }) => ({ project: logical.updateInterface(project, id, details) })),
  deleteInterface: (id) => set(({ project }) => ({ project: logical.deleteInterface(project, id) })),
  assignSubnetToVlan: (subnetId, vlanId) => set(({ project }) => ({ project: logical.assignSubnetToVlan(project, subnetId, vlanId) })),
  addHardwareItem: (details) => set(({ project }) => ({ project: hardware.addHardwareItem(project, details) })),
  updateHardwareItem: (id, details) => set(({ project }) => ({ project: hardware.updateHardwareItem(project, id, details) })),
  deleteHardwareItem: (id) => set(({ project }) => ({ project: hardware.deleteHardwareItem(project, id) })),
  addAllocation: (details) => set(({ project }) => ({ project: hardware.addAllocation(project, details) })),
  updateAllocation: (id, details) => set(({ project }) => ({ project: hardware.updateAllocation(project, id, details) })),
  deleteAllocation: (id) => set(({ project }) => ({ project: hardware.deleteAllocation(project, id) })),
  addNote: (details) => set(({ project }) => ({ project: notes.addNote(project, details) })),
  updateNote: (id, details) => set(({ project }) => ({ project: notes.updateNote(project, id, details) })),
  deleteNote: (id) => set(({ project }) => ({ project: notes.deleteNote(project, id) })),
  addChecklistItem: (details) => set(({ project }) => ({ project: notes.addChecklistItem(project, details) })),
  updateChecklistItem: (id, details) => set(({ project }) => ({ project: notes.updateChecklistItem(project, id, details) })),
  setChecklistStatus: (id, status) => set(({ project }) => ({ project: notes.setChecklistStatus(project, id, status) })),
  deleteChecklistItem: (id) => set(({ project }) => ({ project: notes.deleteChecklistItem(project, id) })),
  moveLogicalNodes: (positions) => set(({ project }) => ({ project: logical.moveLogicalNodes(project, positions) })),
  }
})
