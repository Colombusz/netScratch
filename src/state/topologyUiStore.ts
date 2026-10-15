import { create } from 'zustand'

export type TopologySelection =
  | { kind: 'device' | 'port' | 'link' | 'connect'; id: string }
  | { kind: 'vlan' | 'subnet' | 'interface'; id: string }
  | null

type TopologyUiState = {
  selection: TopologySelection
  select: (selection: TopologySelection) => void
}

export const useTopologyUiStore = create<TopologyUiState>((set) => ({ selection: null, select: (selection) => set({ selection }) }))
