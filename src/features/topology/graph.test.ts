import { expect, it } from 'vitest'
import { createEmptyProject } from '../../core/schema'
import { addDevice, addPorts, saveCable, updateDevice } from '../../core/topology'
import { physicalEdges, physicalNodes, siteArrangement } from './graph'

it('derives port-handle edges and site outlines without changing the document', () => {
  let project = addDevice(createEmptyProject(), { name: 'Router', role: 'router', scope: 'HQ' }, { x: 0, y: 0 })
  project = addDevice(project, { name: 'Switch', role: 'switch', scope: 'HQ' }, { x: 400, y: 100 })
  for (const device of project.devices) project = addPorts(project, device.id, [{ name: 'Gi0/1', speed: '1 Gbps', media: 'copper' }])
  project = saveCable(project, { sourcePortId: project.ports[0]!.id, targetPortId: project.ports[1]!.id, cableType: 'Cat6', label: 'Uplink' })
  const before = structuredClone(project)
  const nodes = physicalNodes(project.devices, project.ports, project.layout.physical, true)
  expect(nodes.filter((node) => node.type === 'site')).toHaveLength(1)
  const deviceNodes = nodes.filter((node) => node.type === 'device')
  const nextNodes = physicalNodes(project.devices, project.ports, project.layout.physical, false, nodes)
  expect(nextNodes).toEqual(deviceNodes)
  expect(nextNodes[0]).toBe(deviceNodes[0])
  const edges = physicalEdges(project.links, project.ports)
  expect(edges[0]).toMatchObject({ source: project.devices[0]!.id, target: project.devices[1]!.id, sourceHandle: project.ports[0]!.id, targetHandle: project.ports[1]!.id, label: 'Cat6 · Uplink' })
  expect(project).toEqual(before)
  const renamed = updateDevice(project, project.devices[0]!.id, { name: 'Edge', role: 'router', scope: 'HQ' })
  expect(physicalNodes(renamed.devices, renamed.ports, renamed.layout.physical, false, nodes)[0]?.ariaLabel).toBe('Edge, router')
})

it('arranges device heights and sites without overlap and ignores dangling cables in the view', () => {
  let project = createEmptyProject()
  for (let i = 0; i < 8; i++) project = addDevice(project, { name: String(i), role: 'switch', scope: i < 4 ? 'HQ' : 'Branch' }, { x: 0, y: 0 })
  project = addPorts(project, project.devices[0]!.id, Array.from({ length: 24 }, (_, i) => ({ name: `Gi0/${i}`, speed: '1 Gbps', media: 'copper' })))
  const arranged = siteArrangement(project.devices, project.ports)
  expect(arranged[3]!.position.y).toBeGreaterThan(arranged[0]!.position.y + 24 * 44)
  expect(arranged[4]!.position.y).toBeGreaterThan(arranged[3]!.position.y)
  expect(physicalEdges([{ id: 'bad', sourcePortId: 'missing', targetPortId: 'missing', label: '', cableType: 'Cat6' }], project.ports)).toEqual([])
})
