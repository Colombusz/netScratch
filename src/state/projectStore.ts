import { create } from 'zustand'
import { createEmptyProject, projectSchema, type Project } from '../core/schema'
import * as topology from '../core/topology'
import * as logical from '../core/logical'

type ProjectState = {
  project: Project
  replaceProject: (project: Project) => void
  renameProject: (name: string) => void
  addDevice: (details: topology.DeviceDetails, position: topology.Position) => string
  updateDevice: (id: string, details: topology.DeviceDetails) => void
  moveDevices: (changes: { id: string; position: topology.Position }[]) => void
  addPorts: (deviceId: string, details: topology.PortDetails[]) => void
  addBulkPorts: (deviceId: string, details: topology.BulkPorts) => void
  updatePort: (id: string, details: topology.PortDetails) => void
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
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: createEmptyProject(),
  replaceProject: (project) => set({ project: projectSchema.parse(project) }),
  renameProject: (name) => set(({ project }) => ({
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
}))
