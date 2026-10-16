import type { Project } from './schema'
import { collectIssues } from './issues'

export function reportIssues(project: Project): string[] {
  return collectIssues(project).map((issue) => `${issue.severity === 'error' ? 'Error' : 'Warning'}: ${issue.message}`)
}

export const reportAssumptions = [
  'This is a proposed network plan, not a routing simulation or a record of deployed configuration.',
  'Subnet host requirements include gateways. /31 networks are intended for point-to-point links; /32 represents one address.',
  'Hardware costs use one user-chosen currency. Allocations may exceed available stock to represent planned purchases.',
  'Compatibility checks use declared port media/speeds and explicit hardware role:, media:, mode:, and speed: capability tags. Unspecified capabilities are unknown. Speed differences may support negotiation.',
  'Device scope identifies its routing domain and matches address-space scope exactly. Duplicate interface IPs are checked within that domain. A subnet gateway may also be assigned to its router interface.',
  'Diagrams use saved positions when available and a default arrangement otherwise. Tables retain complete entity labels and details.',
]
