import { expect, it } from 'vitest'
import { createEmptyProject } from '../../core/schema'
import { logicalNodes, logicalEdges } from './logicalGraph'

function fixture() {
  const project = createEmptyProject()
  project.vlans = [{ id: 'staff', number: 10, name: 'Staff' }, { id: 'guest', number: 20, name: 'Guest' }]
  project.subnets = ['assigned', 'unassigned'].map((id) => ({ id, name: id, addressSpaceId: 'space', cidr: '10.0.0.0/24', status: 'allocated', hostRequirement: 10, gatewayIp: null, vlanId: id === 'assigned' ? 'staff' : null, source: 'manual', notes: '' }))
  project.devices = [{ id: 'router', name: 'Router', role: 'router', hardwareItemId: null, scope: 'HQ', notes: '' }]
  project.ports = [{ id: 'port', deviceId: 'router', name: 'eth0', speed: '1 Gbps', media: 'copper', mode: 'routed', accessVlanId: null, trunkVlanIds: [] }]
  project.interfaces = [
    { id: 'physical', name: 'WAN', deviceId: 'router', kind: 'physical', portId: 'port', vlanId: 'staff', address: '10.0.0.1/24' },
    { id: 'guest-iface', name: 'Guest SVI', deviceId: 'router', kind: 'SVI', portId: null, vlanId: 'guest', address: null },
    { id: 'loopback', name: 'Loopback', deviceId: 'router', kind: 'loopback', portId: null, vlanId: null, address: '10.255.0.1/32' },
  ]
  return project
}

it('renders every VLAN, subnet, and interface, including interfaces without subnets or VLANs', () => {
  const project = fixture()
  const before = structuredClone(project)
  const nodes = logicalNodes(project.vlans, project.subnets, project.interfaces, {})
  expect(nodes.map((node) => node.id).sort()).toEqual(['vlan:staff', 'vlan:guest', 'subnet:assigned', 'subnet:unassigned', 'iface:physical', 'iface:guest-iface', 'iface:loopback'].sort())
  expect(logicalNodes([], [], project.interfaces, {})).toHaveLength(3)
  const positions = { 'vlan:staff': { x: 30, y: 40 }, 'subnet:assigned': { x: 300, y: 40 }, 'iface:loopback': { x: 600, y: 40 } }
  const moved = logicalNodes(project.vlans, project.subnets, project.interfaces, positions, nodes)
  for (const [id, position] of Object.entries(positions)) expect(moved.find((node) => node.id === id)!.position).toEqual(position)
  expect(project).toEqual(before)
})

it('derives membership edges that connect existing nodes with matching source and target handles', () => {
  const project = fixture()
  const nodes = new Map(logicalNodes(project.vlans, project.subnets, project.interfaces, {}).map((node) => [node.id, node]))
  const edges = logicalEdges(project.vlans, project.subnets, project.interfaces, project.devices, project.ports)
  expect(edges).toHaveLength(3)
  expect(edges.find((edge) => edge.target === 'iface:physical')!.source).toBe('subnet:assigned')
  expect(edges.find((edge) => edge.target === 'iface:guest-iface')!.source).toBe('vlan:guest')
  for (const edge of edges) {
    expect(edge.source).not.toBe(edge.target)
    expect(nodes.get(edge.source)!.handles).toContainEqual(expect.objectContaining({ id: edge.sourceHandle, type: 'source' }))
    expect(nodes.get(edge.target)!.handles).toContainEqual(expect.objectContaining({ id: edge.targetHandle, type: 'target' }))
    expect(edge.animated).not.toBe(true)
  }
})
