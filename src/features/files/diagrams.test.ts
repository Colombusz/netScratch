import { expect, it } from 'vitest'
import { createEmptyProject } from '../../core/schema'
import { buildDiagram, edgeAnnotation } from './diagrams'

it('uses saved positions and facing cable handles, with label bounds inside the report diagram', () => {
  const project = createEmptyProject()
  project.devices = ['left', 'right'].map((id) => ({ id, name: id, role: 'switch', hardwareItemId: null, scope: 'HQ', notes: '' }))
  project.ports = ['left', 'right'].map((id) => ({ id: `${id}-port`, deviceId: id, name: 'eth0', speed: '1 Gbps', media: 'copper', mode: 'unused', accessVlanId: null, trunkVlanIds: [] }))
  project.links = [{ id: 'link', sourcePortId: 'left-port', targetPortId: 'right-port', label: 'Office uplink', cableType: 'Cat6A' }]
  project.layout.physical = { left: { x: -40, y: 70 }, right: { x: 400, y: 70 } }
  const scene = buildDiagram(project, 'physical')
  expect(scene.nodes.find((node) => node.id === 'left')!.x).toBe(-40)
  expect(scene.edges[0]!.x1).toBeLessThan(scene.edges[0]!.x2)
  expect(scene.edges[0]!.x2).toBeLessThan(410)
  const annotation = edgeAnnotation(scene.edges[0]!)
  expect(annotation.lines.join(' ')).toBe('Cat6A · Office uplink')
  expect(annotation.x + annotation.width).toBeLessThanOrEqual(scene.bounds.x + scene.bounds.width)
})
