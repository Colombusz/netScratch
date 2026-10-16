import { ipToNumber, isUsableIp, overlaps, parseCidr, parseNetwork } from './cidr'
import { referenceIssues } from './document'
import { getDevicePortDemand, getHardwareSummary } from './hardware'
import { validateSubnets } from './planning'
import type { Project } from './schema'

export type EntityRef = { entityType: 'project' | 'addressSpace' | 'subnet' | 'vlan' | 'device' | 'port' | 'interface' | 'link' | 'hardwareItem' | 'allocation'; id: string }
export type Issue = {
  id: string
  code: string
  severity: 'error' | 'warning'
  category: 'Addressing' | 'Topology' | 'VLANs' | 'Hardware' | 'Document'
  message: string
  repair: string
  entities: EntityRef[]
}

export function speedMbps(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*([kmgt]?)(?:bps|bit\/s|b\/s)$/i.exec(value.trim())
  if (!match) return null
  return Number(match[1]) * ({ '': 1e-6, k: .001, m: 1, g: 1000, t: 1e6 }[match[2]!.toLowerCase()]!)
}

export function collectIssues(project: Project): Issue[] {
  const issues: Issue[] = []
  const ref = (entityType: EntityRef['entityType'], id: string): EntityRef => ({ entityType, id })
  function add(code: string, severity: Issue['severity'], category: Issue['category'], message: string, repair: string, entities: EntityRef[]) {
    const id = JSON.stringify([code, ...entities.map((entity) => `${entity.entityType}:${entity.id}`), message])
    issues.push({ id, code, severity, category, message, repair, entities })
  }
  for (const message of referenceIssues(project)) add('reference', 'error', 'Document', message, 'Review project JSON in Files and correct the missing or circular reference.', [ref('project', project.id)])
  for (const subnet of project.subnets) {
    for (const message of validateSubnets(project.addressSpaces, [subnet])) add('subnet-invalid', 'error', 'Addressing', message, 'Edit this subnet or its parent block in Planner.', [ref('subnet', subnet.id)])
  }
  for (let i = 0; i < project.subnets.length; i++) {
    const a = project.subnets[i]!
    const aScope = project.addressSpaces.find((space) => space.id === a.addressSpaceId)?.scope
    for (const b of project.subnets.slice(i + 1)) {
      const bScope = project.addressSpaces.find((space) => space.id === b.addressSpaceId)?.scope
      if (aScope && aScope === bScope && overlaps(parseNetwork(a.cidr), parseNetwork(b.cidr))) add('subnet-overlap', 'error', 'Addressing', `${a.name} overlaps ${b.name} in scope ${aScope}.`, 'Move one subnet to a free range or correct its routing scope.', [ref('subnet', a.id), ref('subnet', b.id)])
    }
  }
  for (const vlan of project.vlans) {
    const duplicates = project.vlans.filter((other) => other.id !== vlan.id && other.number === vlan.number)
    if (duplicates.length && vlan.id < duplicates[0]!.id) add('vlan-number', 'error', 'VLANs', `VLAN number ${vlan.number} is used more than once.`, 'Choose unique VLAN numbers.', [ref('vlan', vlan.id), ...duplicates.map((v) => ref('vlan', v.id))])
    const subnets = project.subnets.filter((subnet) => subnet.vlanId === vlan.id)
    if (subnets.length > 1) add('vlan-subnets', 'error', 'VLANs', `${vlan.name} is assigned to ${subnets.length} subnets.`, 'Keep one subnet per VLAN in this planner.', subnets.map((s) => ref('subnet', s.id)))
  }
  for (const port of project.ports) {
    const target = [ref('port', port.id)]
    if (port.mode === 'access' && !port.accessVlanId) add('access-vlan', 'warning', 'VLANs', `${port.name} has no access VLAN.`, 'Choose an access VLAN or change the port mode.', target)
    if (port.mode === 'trunk' && !port.trunkVlanIds.length) add('trunk-vlans', 'warning', 'VLANs', `${port.name} carries no VLANs.`, 'Choose the VLANs carried by this trunk.', target)
    if ((port.mode !== 'access' && port.accessVlanId) || (port.mode !== 'trunk' && port.trunkVlanIds.length)) add('port-mode', 'error', 'VLANs', `${port.name} has VLAN assignments inconsistent with ${port.mode} mode.`, 'Apply the intended mode and VLAN assignments.', target)
    if (new Set(port.trunkVlanIds).size !== port.trunkVlanIds.length) add('trunk-duplicate', 'warning', 'VLANs', `${port.name} repeats a trunk VLAN.`, 'Apply the trunk VLAN selection once per VLAN.', target)
    if (project.ports.some((other) => other.id < port.id && other.deviceId === port.deviceId && other.name === port.name)) add('port-name', 'error', 'Topology', `${port.name} repeats a port name on the same device.`, 'Give each port on this device a unique name.', target)
  }
  const addresses = new Map<string, typeof project.interfaces>()
  for (const iface of project.interfaces) {
    const target = [ref('interface', iface.id)]
    const device = project.devices.find((item) => item.id === iface.deviceId)
    const port = project.ports.find((item) => item.id === iface.portId)
    if (project.interfaces.some((other) => other.id < iface.id && other.deviceId === iface.deviceId && other.name === iface.name)) add('interface-name', 'error', 'Topology', `${iface.name} repeats an interface name on ${device?.name ?? 'its device'}.`, 'Give each interface on this device a unique name.', target)
    if (iface.kind === 'physical' && project.interfaces.some((other) => other.id < iface.id && other.kind === 'physical' && other.portId === iface.portId)) add('interface-port', 'error', 'Topology', `${iface.name} shares its physical port with another interface.`, 'Choose a separate physical port.', target)
    if (iface.kind !== 'physical' && iface.portId) add('virtual-port', 'error', 'Topology', `${iface.name} assigns a physical port to a virtual interface.`, 'Apply the virtual interface to clear its physical-port assignment.', target)
    if ((iface.kind === 'SVI' || iface.kind === 'subinterface') && !iface.vlanId) add('interface-vlan', 'warning', 'VLANs', `${iface.name} has no VLAN.`, 'Assign the intended VLAN.', target)
    if (iface.kind === 'loopback' && iface.vlanId) add('loopback-vlan', 'error', 'VLANs', `${iface.name} is a loopback assigned to a VLAN.`, 'Remove the VLAN assignment from this loopback.', target)
    if (port && (port.mode === 'unused' || port.mode === 'access' && iface.vlanId !== port.accessVlanId || port.mode === 'trunk' && iface.vlanId && !port.trunkVlanIds.includes(iface.vlanId))) add('interface-port-mode', 'error', 'VLANs', `${iface.name} conflicts with port ${port.name}'s mode or VLANs.`, 'Align the port mode and VLANs with this interface.', [...target, ref('port', port.id)])
    if (!iface.address || !device) continue
    const address = parseCidr(iface.address)
    const key = JSON.stringify([device.scope, address.address])
    addresses.set(key, [...addresses.get(key) ?? [], iface])
    const scoped = project.subnets.filter((s) => project.addressSpaces.find((space) => space.id === s.addressSpaceId)?.scope === device.scope)
    const matching = scoped.filter((s) => { const block = parseNetwork(s.cidr); const ip = ipToNumber(address.address); return ip >= block.start && ip <= block.end && (!iface.vlanId || s.vlanId === iface.vlanId) })
    if (!isUsableIp(address.address, address)) add('interface-host', 'error', 'Addressing', `${iface.name}: ${address.address} is a network or broadcast address.`, 'Use a usable host address.', target)
    if (scoped.length && !matching.length) add('interface-outside', 'warning', 'Addressing', `${iface.name}: ${iface.address} is outside the planned subnet/VLAN in scope ${device.scope}.`, 'Correct the address, VLAN, device scope, or subnet plan.', [...target, ref('device', device.id)])
    for (const subnet of matching) {
      if (!isUsableIp(address.address, parseNetwork(subnet.cidr)) && isUsableIp(address.address, address)) add('subnet-host', 'error', 'Addressing', `${iface.name}: ${address.address} is not usable inside ${subnet.cidr}.`, 'Use a usable host address from the planned subnet.', [...target, ref('subnet', subnet.id)])
      if (subnet.status === 'reserved') add('interface-reserved', 'error', 'Addressing', `${iface.name} uses reserved range ${subnet.name}.`, 'Move the interface to an allocated subnet.', [...target, ref('subnet', subnet.id)])
      if (address.prefix !== parseNetwork(subnet.cidr).prefix && iface.kind !== 'loopback') add('interface-prefix', 'warning', 'Addressing', `${iface.name}'s prefix differs from ${subnet.name} (${subnet.cidr}).`, 'Check the interface prefix against its subnet.', [...target, ref('subnet', subnet.id)])
    }
  }
  for (const group of addresses.values()) if (group.length > 1) add('duplicate-ip', 'error', 'Addressing', `${parseCidr(group[0]!.address!).address} is assigned to ${group.length} interfaces in the same routing scope.`, 'Choose unique interface addresses within this scope.', group.map((i) => ref('interface', i.id)))
  for (const link of project.links) {
    const a = project.ports.find((port) => port.id === link.sourcePortId)
    const b = project.ports.find((port) => port.id === link.targetPortId)
    const target = [ref('link', link.id)]
    const name = link.label || link.cableType || 'Cable'
    if (!a || !b) continue
    if (a.id === b.id) add('cable-self', 'error', 'Topology', `${name} connects a port to itself.`, 'Choose two distinct ports.', target)
    else if (a.deviceId === b.deviceId) add('cable-device-loop', 'warning', 'Topology', `${name} connects two ports on the same device.`, 'Check whether this loop is intentional.', target)
    if (project.links.some((other) => other.id < link.id && [other.sourcePortId, other.targetPortId].some((id) => id === a.id || id === b.id))) add('cable-occupied', 'error', 'Topology', `${name} shares a port with another cable.`, 'Use a free port for each cable end.', target)
    const cableMedia = /^(cat\s*\d|copper|rj-?45)/i.test(link.cableType.trim()) ? 'copper' : /fiber|fibre|single.?mode|multi.?mode|^om[1-5]$|^os[12]$/i.test(link.cableType.trim()) ? 'fiber' : null
    if (a.media !== b.media || cableMedia && (a.media !== cableMedia || b.media !== cableMedia)) add('cable-media', 'error', 'Topology', `${name} has incompatible cable/port media.`, 'Choose matching media at both ends and an appropriate cable.', [...target, ref('port', a.id), ref('port', b.id)])
    if (a.mode === 'unused' || b.mode === 'unused') add('cable-unused', 'error', 'Topology', `${name} is connected to an unused port.`, 'Set the connected port to its intended mode.', [...target, ref('port', a.mode === 'unused' ? a.id : b.id)])
    const aSpeed = speedMbps(a.speed), bSpeed = speedMbps(b.speed)
    if (aSpeed !== null && bSpeed !== null && aSpeed !== bSpeed) add('cable-speed', 'warning', 'Topology', `${name} joins ports with different declared speeds (${a.speed}, ${b.speed}).`, 'Check supported negotiation speeds or use matching ports.', [...target, ref('port', a.id), ref('port', b.id)])
    if (a.mode === 'access' && b.mode === 'access' && a.accessVlanId && b.accessVlanId && a.accessVlanId !== b.accessVlanId) add('cable-access-vlan', 'error', 'VLANs', `${name} joins different access VLANs.`, 'Align access VLANs at both ends.', [...target, ref('port', a.id), ref('port', b.id)])
    for (const [access, trunk] of [[a, b], [b, a]]) if (access!.mode === 'access' && trunk!.mode === 'trunk' && access!.accessVlanId && !trunk!.trunkVlanIds.includes(access!.accessVlanId)) add('cable-trunk-vlan', 'error', 'VLANs', `${name}'s trunk does not carry its access VLAN.`, 'Include the access VLAN in the trunk or correct the connection.', [...target, ref('port', trunk!.id)])
    if (a.mode === 'trunk' && b.mode === 'trunk' && !a.trunkVlanIds.some((id) => b.trunkVlanIds.includes(id))) add('cable-trunks', 'warning', 'VLANs', `${name}'s trunks have no VLAN in common.`, 'Choose the VLANs that should cross this cable.', [...target, ref('port', a.id), ref('port', b.id)])
  }
  for (const { item, allocatedQty, isShortage } of getHardwareSummary(project).summary) if (isShortage) add('hardware-stock', 'warning', 'Hardware', `Hardware item ${item.model} overallocated: ${allocatedQty} of ${item.quantityAvailable}.`, 'Increase available stock or reduce allocations.', [ref('hardwareItem', item.id)])
  for (const device of project.devices) {
    const { demand, supply, shortage } = getDevicePortDemand(project, device.id)
    if (shortage) add('hardware-ports', 'warning', 'Hardware', `Device ${device.name}: port demand (${demand}) exceeds hardware supply (${supply}).`, 'Allocate sufficient hardware or remove unused planned ports.', [ref('device', device.id), ...project.allocations.filter((a) => a.deviceId === device.id).map((a) => ref('allocation', a.id))])
    const itemIds = new Set([device.hardwareItemId, ...project.allocations.filter((a) => a.deviceId === device.id).map((a) => a.hardwareItemId)])
    const capabilities = project.hardwareItems.filter((h) => itemIds.has(h.id)).flatMap((h) => h.capabilities.map((c) => c.trim().toLowerCase()))
    const roles = capabilities.filter((c) => c.startsWith('role:'))
    if (roles.length && !roles.includes(`role:${device.role}`)) add('hardware-role', 'warning', 'Hardware', `${device.name}'s role is not declared by its hardware.`, 'Review device role or hardware capability tags.', [ref('device', device.id)])
    for (const port of project.ports.filter((p) => p.deviceId === device.id)) {
      for (const [group, value] of [['media', port.media], ['mode', port.mode]] as const) if (capabilities.some((c) => c.startsWith(`${group}:`)) && !capabilities.includes(`${group}:${value}`)) add(`hardware-${group}`, 'warning', 'Hardware', `${device.name} / ${port.name}: ${value} is not declared by its hardware.`, `Review the hardware ${group}: tags or this port.`, [ref('port', port.id), ...project.hardwareItems.filter((h) => itemIds.has(h.id)).map((h) => ref('hardwareItem', h.id))])
      const speeds = capabilities.filter((c) => c.startsWith('speed:')).map((c) => speedMbps(c.slice(6))).filter((s) => s !== null)
      const speed = speedMbps(port.speed)
      if (speed !== null && speeds.length && !speeds.includes(speed)) add('hardware-speed', 'warning', 'Hardware', `${device.name} / ${port.name}: ${port.speed} is not declared by its hardware.`, 'Review speed: capability tags or the planned port speed.', [ref('port', port.id)])
    }
  }
  return issues.sort((a, b) => Number(a.severity === 'warning') - Number(b.severity === 'warning') || a.category.localeCompare(b.category) || a.message.localeCompare(b.message))
}
