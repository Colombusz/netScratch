import type { Project } from './schema'
import { referenceIssues } from './document'
import { validateSubnets } from './planning'
import { validateLogical } from './logical'
import { validateHardware } from './hardware'

export function reportIssues(project: Project): string[] {
  return [...new Set([...referenceIssues(project), ...validateSubnets(project.addressSpaces, project.subnets), ...validateLogical(project), ...validateHardware(project)])]
}

export const reportAssumptions = [
  'This is a proposed network plan, not a routing simulation or a record of deployed configuration.',
  'Subnet host requirements include gateways. /31 networks are intended for point-to-point links; /32 represents one address.',
  'Hardware costs use one user-chosen currency. Allocations may exceed available stock to represent planned purchases.',
  'Port capacity compares counts only. Media, speed, and capability compatibility are not checked by the current hardware checks.',
  'Diagrams use saved positions when available and a default arrangement otherwise. Tables retain complete entity labels and details.',
]
