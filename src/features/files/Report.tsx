import type { ReactNode } from 'react'
import type { Project } from '../../core/schema'
import { attachmentLabel } from '../../core/notes'
import { getHardwareSummary } from '../../core/hardware'
import { reportAssumptions, reportIssues } from '../../core/report'
import { buildDiagram, edgeAnnotation } from './diagrams'

const money = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const shortLabel = (text: string, width: number) => text.length > width ? `${text.slice(0, width - 1)}…` : text

function ReportTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return <p className="report-empty">No {caption.toLowerCase()} recorded.</p>
  return <table className="report-table"><caption>{caption}</caption><thead><tr>{headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((cells, index) => <tr key={index}>{cells.map((cell, column) => column === 0 ? <th scope="row" key={column}>{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody></table>
}

function Diagram({ project, kind, tiled }: { project: Project; kind: 'physical' | 'logical'; tiled: boolean }) {
  const scene = buildDiagram(project, kind)
  const parts = tiled && scene.nodes.length ? [0, 1, 2, 3] : [0]
  const { x, y, width, height } = scene.bounds
  return <>{parts.map((part) => {
    const tile = parts.length > 1
    const box = tile ? { x: x + part % 2 * width / 2, y: y + Math.floor(part / 2) * height / 2, width: width / 2, height: height / 2 } : scene.bounds
    const id = `report-${kind}-${part}`
    return <div key={part} className={`diagram-sheet${tile ? ' diagram-tile' : ''}`}>
      <h3>{kind === 'physical' ? 'Physical' : 'Logical'} diagram{tile ? `: row ${Math.floor(part / 2) + 1}, column ${part % 2 + 1}` : ''}</h3>
      <svg className="report-svg" xmlns="http://www.w3.org/2000/svg" viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`} width={box.width} height={box.height} role="img" aria-labelledby={`${id}-title`}>
        <title id={`${id}-title`}>{kind === 'physical' ? 'Physical device and cable' : 'Logical VLAN, subnet, and interface'} diagram from saved project positions{tile ? `, tile ${part + 1} of 4` : ''}. Full labels appear in the report tables.</title>
        {scene.edges.map((edge) => {
          const mid = (edge.x1 + edge.x2) / 2
          return <path key={edge.id} d={`M ${edge.x1} ${edge.y1} H ${mid} V ${edge.y2} H ${edge.x2}`} fill="none" stroke="#12634f" strokeWidth="2" />
        })}
        {scene.nodes.map((node) => <g key={node.id} data-entity-id={node.id} transform={`translate(${node.x} ${node.y})`}><rect width={node.width} height={node.height} rx="5" fill="#fff" stroke="#52615b" />{node.labels.map((line, index) => <text key={index} x="12" y={line.y} fontSize={line.strong ? '16' : '13'} fontWeight={line.strong ? '650' : '400'} fill="#202b28"><title>{line.text}</title>{shortLabel(line.text, Math.floor((node.width - 24) / (line.strong ? 9 : 7)))}</text>)}</g>)}
        {scene.edges.filter((edge) => edge.label).map((edge) => {
          const label = edgeAnnotation(edge)
          return <g key={`label:${edge.id}`} transform={`translate(${label.x} ${label.y})`}><title>{edge.label}</title><rect width={label.width} height={label.height} fill="#fff" />{label.lines.map((line, index) => <text key={index} x={label.width / 2} y={14 + index * 14} textAnchor="middle" fontSize="12" fill="#202b28">{line}</text>)}</g>
        })}
        {!scene.nodes.length && <text x="20" y="45" fill="#52615b" fontSize="16">No {kind === 'physical' ? 'physical devices' : 'logical entities'} recorded.</text>}
      </svg>
    </div>
  })}</>
}

export function Report({ project, tiled }: { project: Project; tiled: boolean }) {
  const issues = reportIssues(project)
  const hardware = getHardwareSummary(project)
  const deviceName = (id: string | null) => project.devices.find((device) => device.id === id)?.name ?? 'Missing device'
  const portName = (id: string) => { const port = project.ports.find((item) => item.id === id); return port ? `${deviceName(port.deviceId)} / ${port.name}` : 'Missing port' }
  const vlanName = (id: string | null) => { const vlan = project.vlans.find((item) => item.id === id); return vlan ? `${vlan.number}: ${vlan.name}` : id ? 'Missing VLAN' : 'None' }

  return <article className="print-report" aria-labelledby="report-title">
    <header className="report-heading"><p>netScratch / Network plan</p><h1 id="report-title">{project.name}</h1><p>Schema {project.schemaVersion}. Last committed update: <time dateTime={project.updatedAt}>{project.updatedAt}</time>.</p></header>
    <section className="report-section" aria-labelledby="report-overview"><h2 id="report-overview">1. Overview, assumptions, and unresolved checks</h2>
      <p>Devices: {project.devices.length}; ports: {project.ports.length}; cables: {project.links.length}; subnets: {project.subnets.length}; VLANs: {project.vlans.length}; notes: {project.notes.length}; implementation tasks: {project.checklistItems.length}.</p>
      <h3>Assumptions</h3><ul>{reportAssumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
      <h3>Unresolved checks ({issues.length})</h3>{issues.length ? <ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : <p>No issues were found by the current address, reference, logical, and hardware checks.</p>}
      <p>Broader network validation is planned for Phase 5. A clean report does not verify deployed configuration.</p>
    </section>
    <section className="report-section" aria-labelledby="report-physical"><h2 id="report-physical">2. Physical topology</h2><Diagram project={project} kind="physical" tiled={tiled} />
      <ReportTable caption="Devices" headers={['Device', 'Role', 'Site / scope', 'Notes']} rows={project.devices.map((device) => [device.name, device.role, device.scope, device.notes || 'None'])} />
    </section>
    <section className="report-section" aria-labelledby="report-logical"><h2 id="report-logical">3. Logical topology</h2><Diagram project={project} kind="logical" tiled={tiled} /><p>Membership lines show VLAN relationships through an assigned subnet when available. Interface labels name the device; an unassigned entity has no invented membership connection.</p></section>
    <section className="report-section" aria-labelledby="report-addressing"><h2 id="report-addressing">4. Addressing and VLAN plan</h2>
      <ReportTable caption="Address spaces" headers={['Name', 'Parent CIDR', 'Routing scope']} rows={project.addressSpaces.map((space) => [space.name, space.parentCidr, space.scope])} />
      <ReportTable caption="Subnets" headers={['Subnet / scope', 'CIDR', 'Status / source', 'Hosts', 'Gateway', 'VLAN', 'Notes']} rows={project.subnets.map((subnet) => [<>{subnet.name}<br />{project.addressSpaces.find((space) => space.id === subnet.addressSpaceId)?.scope ?? 'Missing address space'}</>, subnet.cidr, `${subnet.status} / ${subnet.source}`, subnet.hostRequirement, subnet.gatewayIp ?? 'None', vlanName(subnet.vlanId), subnet.notes || 'None'])} />
      <ReportTable caption="VLANs" headers={['Number', 'Name']} rows={project.vlans.map((vlan) => [vlan.number, vlan.name])} />
    </section>
    <section className="report-section" aria-labelledby="report-hardware"><h2 id="report-hardware">5. Hardware and allocations</h2><p>Stock cost: {money(hardware.totalBudget)}. Allocated cost: {money(hardware.totalAllocatedCost)}. Costs use the project's single user-chosen currency.</p>
      <ReportTable caption="Hardware inventory" headers={['Model / category', 'Available', 'Allocated', 'Balance', 'Ports / unit', 'Unit cost', 'Capabilities']} rows={hardware.summary.map(({ item, allocatedQty, freeQty }) => [`${item.model} / ${item.category}`, item.quantityAvailable, allocatedQty, freeQty < 0 ? `Short ${-freeQty}` : `${freeQty} free`, item.portCount, money(item.unitCost), item.capabilities.join(', ') || 'None'])} />
      <ReportTable caption="Hardware allocations" headers={['Model', 'Assigned to', 'Quantity', 'Allocated cost']} rows={project.allocations.map((allocation) => { const item = project.hardwareItems.find((entry) => entry.id === allocation.hardwareItemId); return [item?.model ?? 'Missing hardware', allocation.deviceId ? deviceName(allocation.deviceId) : allocation.scope, allocation.quantity, item ? money(item.unitCost * allocation.quantity) : 'Unknown'] })} />
    </section>
    <section className="report-section" aria-labelledby="report-schedules"><h2 id="report-schedules">6. Port, interface, and cable schedules</h2>
      <ReportTable caption="Ports" headers={['Device / port', 'Speed', 'Media', 'Mode', 'Access VLAN', 'Trunk VLANs']} rows={project.ports.map((port) => [portName(port.id), port.speed || 'Unspecified', port.media, port.mode, vlanName(port.accessVlanId), port.trunkVlanIds.map(vlanName).join(', ') || 'None'])} />
      <ReportTable caption="Interfaces" headers={['Device / interface', 'Kind', 'Port', 'VLAN', 'IPv4 address / prefix']} rows={project.interfaces.map((iface) => [`${deviceName(iface.deviceId)} / ${iface.name}`, iface.kind, iface.portId ? portName(iface.portId) : 'None', vlanName(iface.vlanId), iface.address ?? 'Unnumbered'])} />
      <ReportTable caption="Cables" headers={['Label', 'End A', 'End B', 'Cable type']} rows={project.links.map((link) => [link.label || 'Unlabeled', portName(link.sourcePortId), portName(link.targetPortId), link.cableType || 'Unspecified'])} />
    </section>
    <section className="report-section" aria-labelledby="report-notes"><h2 id="report-notes">7. Notes and implementation checklist</h2>
      {!project.notes.length && <p>No notes recorded.</p>}{project.notes.map((note, index) => <div className="report-note" key={note.id}><h3>Note {index + 1}: {attachmentLabel(project, note.attachedTo)}</h3><p>{note.text}</p></div>)}
      <p>{project.checklistItems.filter((item) => item.status === 'done').length} of {project.checklistItems.length} implementation tasks done.</p>
      <ReportTable caption="Implementation checklist" headers={['Task', 'Status', 'Attachment']} rows={project.checklistItems.map((task) => [task.task, { todo: 'To do', doing: 'Doing', done: 'Done' }[task.status], attachmentLabel(project, task.attachedTo)])} />
    </section>
  </article>
}
