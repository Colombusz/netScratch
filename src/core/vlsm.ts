import { z } from 'zod'
import { contains, numberToIp, overlaps, parseNetwork, prefixForHosts, rangeToCidrs } from './cidr'

export const requirementSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Give each segment a name.'),
  hosts: z.number().int().min(1).max(4_294_967_294),
})
export type Requirement = z.infer<typeof requirementSchema>

export function freeSpace(parentCidr: string, occupiedCidrs: string[]): string[] {
  const parent = parseNetwork(parentCidr)
  const occupied = occupiedCidrs.map(parseNetwork).sort((a, b) => a.start - b.start)
  let cursor = parent.start
  const free: string[] = []
  for (let i = 0; i < occupied.length; i++) {
    const block = occupied[i]!
    if (!contains(parent, block)) throw new Error(`${block.cidr} is outside parent ${parent.cidr}.`)
    if (i > 0 && overlaps(occupied[i - 1]!, block)) throw new Error(`${block.cidr} overlaps another occupied range.`)
    if (cursor < block.start) free.push(...rangeToCidrs(cursor, block.start - 1))
    cursor = block.end + 1
  }
  if (cursor <= parent.end) free.push(...rangeToCidrs(cursor, parent.end))
  return free
}

export function allocateVlsm(parentCidr: string, input: Requirement[], reservedCidrs: string[] = []) {
  const requirements = z.array(requirementSchema).parse(input)
  if (new Set(requirements.map((r) => r.id)).size !== requirements.length) throw new Error('Segment IDs must be unique.')
  let free = freeSpace(parentCidr, reservedCidrs)
  const allocated: (Requirement & { cidr: string; gatewayIp: string })[] = []
  const failures: { id: string; name: string; message: string }[] = []
  const sorted = requirements.map((r) => ({ ...r, prefix: prefixForHosts(r.hosts) }))
    .sort((a, b) => a.prefix - b.prefix)
  for (const { prefix, ...requirement } of sorted) {
    const fit = free.map(parseNetwork).find((block) => block.prefix <= prefix)
    if (!fit) {
      failures.push({ id: requirement.id, name: requirement.name,
        message: `Insufficient space for ${requirement.name}: ${requirement.hosts} usable addresses require a /${prefix} block. No aligned block fits in ${parseNetwork(parentCidr).cidr}.` })
      continue
    }
    const cidr = `${numberToIp(fit.start)}/${prefix}`
    allocated.push({ ...requirement, cidr, gatewayIp: parseNetwork(cidr).firstUsable })
    free = freeSpace(parentCidr, [...reservedCidrs, ...allocated.map((r) => r.cidr)])
  }
  return { allocated, failures, free }
}
