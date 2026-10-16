import { createEmptyProject, projectSchema, type Device, type Interface, type Port, type Project, type Subnet } from './schema'

export function createSampleProject(): Project {
  const project = createEmptyProject('Sample / Office and branch')
  const id = (kind: string, key: string) => `sample-${kind}-${key}`
  const vlan = (key: string) => id('vlan', key)
  const device = (key: string) => id('device', key)
  const port = (key: string) => id('port', key)
  const subnet = (key: string) => id('subnet', key)
  const hardware = (key: string) => id('hardware', key)
  project.addressSpaces = [
    { id: id('space', 'hq'), name: 'Office networks', parentCidr: '10.20.0.0/16', scope: 'Headquarters' },
    { id: id('space', 'branch'), name: 'Branch networks', parentCidr: '10.30.0.0/16', scope: 'Branch' },
  ]
  project.vlans = [
    { id: vlan('management'), number: 10, name: 'Management' },
    { id: vlan('staff'), number: 20, name: 'Staff' },
    { id: vlan('guest'), number: 30, name: 'Guests' },
    { id: vlan('services'), number: 40, name: 'Services' },
    { id: vlan('branch'), number: 110, name: 'Branch staff' },
  ]
  const network = (key: string, name: string, cidr: string, hosts: number, gatewayIp: string | null, vlanKey: string | null, branch = false): Subnet => ({
    id: subnet(key), addressSpaceId: id('space', branch ? 'branch' : 'hq'), name, cidr, hostRequirement: hosts, gatewayIp,
    vlanId: vlanKey ? vlan(vlanKey) : null, status: 'allocated', source: 'manual', notes: 'Illustrative addressing for this sample project.',
  })
  project.subnets = [
    network('management', 'Management', '10.20.10.0/27', 20, '10.20.10.1', 'management'),
    network('staff', 'Office staff', '10.20.20.0/25', 100, '10.20.20.1', 'staff'),
    network('guest', 'Guest Wi-Fi', '10.20.30.0/26', 50, '10.20.30.1', 'guest'),
    network('services', 'Shared services', '10.20.40.0/27', 20, '10.20.40.1', 'services'),
    network('loopback', 'Router loopback', '10.20.255.1/32', 1, null, null),
    { ...network('reserved', 'Future office expansion', '10.20.100.0/24', 0, null, null), status: 'reserved', notes: 'Keep this block free for a future floor.' },
    network('branch', 'Branch staff', '10.30.10.0/26', 40, '10.30.10.1', 'branch', true),
  ]
  const addDevice = (key: string, name: string, role: Device['role'], model: string, x: number, y: number, notes: string, branch = false) => {
    project.devices.push({ id: device(key), name, role, hardwareItemId: hardware(model), scope: branch ? 'Branch' : 'Headquarters', notes })
    project.layout.physical[device(key)] = { x, y }
  }
  addDevice('edge', 'Office edge router', 'router', 'router', 60, 60, 'Carrier assigns WAN addresses. Confirm the handoff before deployment.')
  addDevice('core', 'Office core switch', 'switch', 'core', 420, 60, 'Routes the office VLANs. Keep management access on VLAN 10.')
  addDevice('access', 'Office access switch', 'switch', 'access', 780, 60, 'Desk and wireless access. Label wall outlets before patching.')
  addDevice('ap', 'Office wireless AP', 'access point', 'ap', 1140, 60, 'Staff and guest wireless networks; management uses VLAN 10.')
  addDevice('server', 'File and DNS server', 'server', 'server', 420, 440, 'Static service address in VLAN 40.')
  addDevice('workstation', 'Example workstation', 'endpoint', 'workstation', 780, 440, 'Representative wired client on the staff network.')
  addDevice('branch-router', 'Branch edge router', 'router', 'router', -300, 820, 'Site transport addressing is assigned by the carrier.', true)
  addDevice('branch-switch', 'Branch access switch', 'switch', 'access', 60, 820, 'Reserve a spare port for the planned branch access point.', true)

  const addPort = (key: string, deviceKey: string, name: string, mode: Port['mode'], vlans: string[] = [], media: Port['media'] = 'copper', speed = '1 Gbps') => {
    project.ports.push({ id: port(key), deviceId: device(deviceKey), name, mode, speed, media,
      accessVlanId: mode === 'access' ? vlan(vlans[0]!) : null, trunkVlanIds: mode === 'trunk' ? vlans.map(vlan) : [] })
  }
  const officeVlans = ['management', 'staff', 'guest', 'services']
  addPort('edge-wan', 'edge', 'WAN', 'routed', [], 'fiber')
  addPort('edge-lan', 'edge', 'LAN uplink', 'trunk', officeVlans, 'fiber', '10 Gbps')
  addPort('edge-branch', 'edge', 'Branch transport', 'routed', [], 'fiber')
  addPort('core-edge', 'core', 'Edge uplink', 'trunk', officeVlans, 'fiber', '10 Gbps')
  addPort('core-access', 'core', 'Access uplink', 'trunk', officeVlans, 'fiber', '10 Gbps')
  addPort('core-server', 'core', 'Server', 'access', ['services'])
  addPort('core-spare', 'core', 'Spare', 'unused')
  addPort('access-core', 'access', 'Core uplink', 'trunk', officeVlans, 'fiber', '10 Gbps')
  addPort('access-ap', 'access', 'Wireless AP', 'trunk', ['management', 'staff', 'guest'])
  addPort('access-desk', 'access', 'Desk 01', 'access', ['staff'])
  addPort('ap-uplink', 'ap', 'Uplink', 'trunk', ['management', 'staff', 'guest'])
  addPort('server-nic', 'server', 'eth0', 'access', ['services'])
  addPort('workstation-nic', 'workstation', 'eth0', 'access', ['staff'])
  addPort('branch-wan', 'branch-router', 'Office transport', 'routed', [], 'fiber')
  addPort('branch-lan', 'branch-router', 'LAN uplink', 'trunk', ['branch'])
  addPort('branch-switch-uplink', 'branch-switch', 'Router uplink', 'trunk', ['branch'])
  addPort('branch-spare', 'branch-switch', 'Future AP', 'unused')
  project.links = [
    ['office-core', 'edge-lan', 'core-edge', 'OM4 fiber', 'Office backbone'],
    ['office-access', 'core-access', 'access-core', 'OM4 fiber', 'Floor uplink'],
    ['wireless', 'access-ap', 'ap-uplink', 'Cat6', 'Ceiling AP'],
    ['services', 'core-server', 'server-nic', 'Cat6', 'Server patch'],
    ['desk', 'access-desk', 'workstation-nic', 'Cat6', 'Desk 01 outlet'],
    ['site-transport', 'edge-branch', 'branch-wan', 'OS2 fiber', 'Carrier site transport'],
    ['branch-access', 'branch-lan', 'branch-switch-uplink', 'Cat6', 'Branch LAN'],
  ].map(([key, a, b, cableType, label]) => ({ id: id('link', key!), sourcePortId: port(a!), targetPortId: port(b!), cableType: cableType!, label: label! }))
  const addInterface = (key: string, deviceKey: string, name: string, kind: Interface['kind'], address: string | null, vlanKey: string | null = null, portKey: string | null = null) => {
    project.interfaces.push({ id: id('interface', key), deviceId: device(deviceKey), name, kind, address, vlanId: vlanKey ? vlan(vlanKey) : null, portId: portKey ? port(portKey) : null })
  }
  addInterface('wan', 'edge', 'WAN handoff', 'physical', null, null, 'edge-wan')
  addInterface('loopback', 'edge', 'Loopback0', 'loopback', '10.20.255.1/32')
  addInterface('edge-management', 'edge', 'LAN.10', 'subinterface', '10.20.10.2/27', 'management')
  addInterface('management', 'core', 'Vlan10', 'SVI', '10.20.10.1/27', 'management')
  addInterface('staff', 'core', 'Vlan20', 'SVI', '10.20.20.1/25', 'staff')
  addInterface('guest', 'core', 'Vlan30', 'SVI', '10.20.30.1/26', 'guest')
  addInterface('services', 'core', 'Vlan40', 'SVI', '10.20.40.1/27', 'services')
  addInterface('ap', 'ap', 'Management', 'physical', '10.20.10.10/27', 'management', 'ap-uplink')
  addInterface('server', 'server', 'eth0', 'physical', '10.20.40.10/27', 'services', 'server-nic')
  addInterface('workstation', 'workstation', 'eth0', 'physical', '10.20.20.25/25', 'staff', 'workstation-nic')
  addInterface('branch', 'branch-router', 'Vlan110', 'SVI', '10.30.10.1/26', 'branch')
  addInterface('branch-management', 'branch-switch', 'Management', 'physical', '10.30.10.2/26', 'branch', 'branch-switch-uplink')
  project.hardwareItems = [
    { id: hardware('router'), model: 'Sample edge router', category: 'Router', quantityAvailable: 2, unitCost: 850, portCount: 4, capabilities: ['role:router', 'VLAN subinterfaces', 'Site transport'] },
    { id: hardware('core'), model: 'Sample core switch', category: 'Switch', quantityAvailable: 1, unitCost: 1800, portCount: 24, capabilities: ['role:switch', 'Layer 3', '10 Gbps uplinks'] },
    { id: hardware('access'), model: 'Sample access switch', category: 'Switch', quantityAvailable: 2, unitCost: 600, portCount: 24, capabilities: ['role:switch', 'PoE', 'VLAN trunks'] },
    { id: hardware('ap'), model: 'Sample wireless AP', category: 'Wireless', quantityAvailable: 1, unitCost: 220, portCount: 1, capabilities: ['role:access point', 'media:copper', 'speed:1gbps', 'Multiple SSIDs'] },
    { id: hardware('server'), model: 'Sample service server', category: 'Server', quantityAvailable: 1, unitCost: 1400, portCount: 2, capabilities: ['role:server', 'media:copper', 'speed:1gbps'] },
    { id: hardware('workstation'), model: 'Sample workstation', category: 'Client', quantityAvailable: 1, unitCost: 700, portCount: 1, capabilities: ['role:endpoint', 'media:copper', 'speed:1gbps'] },
  ]
  project.allocations = project.devices.map((item) => ({ id: id('allocation', item.id), hardwareItemId: item.hardwareItemId!, deviceId: item.id, scope: null, quantity: 1 }))
  project.allocations.push({ id: id('allocation', 'branch-ap-purchase'), hardwareItemId: hardware('ap'), deviceId: null, scope: 'Branch', quantity: 1 })
  project.notes = [
    { id: id('note', 'overview'), text: 'This is a fictional sample project for exploring netScratch. Models, quantities, and prices are illustrative.\nStart with Physical and Logical, then review Inventory, Notes, and Issues. The planned branch access point deliberately exceeds stock by one unit.', attachedTo: { entityType: 'project', id: project.id } },
    { id: id('note', 'routing'), text: 'The office core provides VLAN gateways. Staff, guest, management, and service traffic use separate VLANs. Firewall policies and actual routing configuration must be reviewed before installation.', attachedTo: { entityType: 'device', id: device('core') } },
    { id: id('note', 'guest'), text: 'Guest access should reach the internet only. Verify isolation from staff and service networks during acceptance testing.', attachedTo: { entityType: 'subnet', id: subnet('guest') } },
    { id: id('note', 'transport'), text: 'The fiber link illustrates the site transport handoff. Carrier WAN addressing is intentionally unspecified; this diagram does not simulate the carrier network.', attachedTo: { entityType: 'link', id: id('link', 'site-transport') } },
    { id: id('note', 'purchase'), text: 'One additional access point is reserved for the branch rollout. Its stock shortage is intentional so you can explore the Issues repair flow.', attachedTo: { entityType: 'allocation', id: id('allocation', 'branch-ap-purchase') } },
  ]
  project.checklistItems = [
    { id: id('task', 'addressing'), task: 'Review office and branch addressing', status: 'done', attachedTo: { entityType: 'project', id: project.id } },
    { id: id('task', 'labels'), task: 'Label office patch panels and desk outlets', status: 'done', attachedTo: { entityType: 'device', id: device('access') } },
    { id: id('task', 'guest'), task: 'Test guest isolation and DNS access', status: 'doing', attachedTo: { entityType: 'vlan', id: vlan('guest') } },
    { id: id('task', 'purchase'), task: 'Purchase the additional branch access point', status: 'todo', attachedTo: { entityType: 'hardwareItem', id: hardware('ap') } },
    { id: id('task', 'carrier'), task: 'Confirm carrier WAN addresses and handoff', status: 'todo', attachedTo: { entityType: 'note', id: id('note', 'transport') } },
    { id: id('task', 'report'), task: 'Export the reviewed project and handoff report', status: 'todo' },
  ]
  for (const [index, item] of project.vlans.entries()) {
    const x = index % 2 * 1100, y = Math.floor(index / 2) * 850
    project.layout.logical[`vlan:${item.id}`] = { x, y }
    const assigned = project.subnets.find((s) => s.vlanId === item.id)!
    project.layout.logical[`subnet:${assigned.id}`] = { x: x + 300, y }
    project.interfaces.filter((i) => i.vlanId === item.id).forEach((iface, row) => {
      project.layout.logical[`iface:${iface.id}`] = { x: x + 600, y: y + row * 260 }
    })
  }
  project.layout.logical[`subnet:${subnet('loopback')}`] = { x: 1100, y: 1700 }
  project.layout.logical[`iface:${id('interface', 'loopback')}`] = { x: 1400, y: 1700 }
  project.layout.logical[`subnet:${subnet('reserved')}`] = { x: 1100, y: 2010 }
  project.layout.logical[`iface:${id('interface', 'wan')}`] = { x: 1400, y: 2010 }
  return projectSchema.parse(project)
}
