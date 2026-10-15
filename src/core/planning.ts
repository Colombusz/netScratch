import { contains, isUsableIp, overlaps, parseNetwork } from './cidr'
import { addressSpaceSchema, projectSchema, subnetSchema, type AddressSpace, type Project, type Subnet } from './schema'
import { allocateVlsm, type Requirement } from './vlsm'

export function validateSubnets(addressSpaces: AddressSpace[], subnets: Subnet[]): string[] {
  const errors: string[] = []
  const parsed: { subnet: Subnet; scope: string; block: ReturnType<typeof parseNetwork> }[] = []
  for (const raw of subnets) {
    const result = subnetSchema.safeParse(raw)
    if (!result.success) {
      errors.push(`${raw.name}: ${result.error.issues.map((i) => i.message).join(' ')}`)
      continue
    }
    const subnet = result.data
    const space = addressSpaces.find((s) => s.id === subnet.addressSpaceId)
    if (!space) { errors.push(`${subnet.name}: address space does not exist.`); continue }
    const block = parseNetwork(subnet.cidr)
    if (!contains(parseNetwork(space.parentCidr), block)) errors.push(`${subnet.name}: ${subnet.cidr} is outside parent ${space.parentCidr}.`)
    if (subnet.hostRequirement > block.usableHosts) errors.push(`${subnet.name}: ${subnet.cidr} has ${block.usableHosts} usable addresses but needs ${subnet.hostRequirement}.`)
    if (subnet.gatewayIp && !isUsableIp(subnet.gatewayIp, block)) errors.push(`${subnet.name}: gateway must be a usable address inside ${subnet.cidr}.`)
    parsed.push({ subnet, scope: space.scope, block })
  }
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i]!
      const b = parsed[j]!
      if (a.scope === b.scope && overlaps(a.block, b.block)) errors.push(`${a.subnet.name} overlaps ${b.subnet.name} in scope ${a.scope}.`)
    }
  }
  return errors
}

export function applyPlan(project: Project, space: AddressSpace, subnets: Subnet[]): Project {
  const addressSpace = addressSpaceSchema.parse(space)
  const addressSpaces = project.addressSpaces.some((s) => s.id === space.id)
    ? project.addressSpaces.map((s) => s.id === space.id ? addressSpace : s)
    : [...project.addressSpaces, addressSpace]
  const allSubnets = [...project.subnets.filter((s) => s.addressSpaceId !== space.id), ...subnets]
  const errors = validateSubnets(addressSpaces, allSubnets)
  if (errors.length) throw new Error(errors.join('\n'))
  return projectSchema.parse({ ...project, addressSpaces, subnets: allSubnets, updatedAt: new Date().toISOString() })
}

export function generatePlan(project: Project, space: AddressSpace, requirements: Requirement[]) {
  const fixed = project.subnets.filter((s) => s.addressSpaceId === space.id && (s.source === 'manual' || s.status === 'reserved'))
  const fixedIds = new Set(fixed.map((s) => s.id))
  const result = allocateVlsm(space.parentCidr, requirements.filter((r) => !fixedIds.has(r.id)), fixed.map((s) => s.cidr))
  const generated = result.allocated.map((r): Subnet => {
    const previous = project.subnets.find((s) => s.id === r.id)
    return { id: r.id, addressSpaceId: space.id, name: r.name, cidr: r.cidr,
      hostRequirement: r.hosts, gatewayIp: r.gatewayIp, vlanId: previous?.vlanId ?? null,
      status: 'allocated', source: 'auto', notes: previous?.notes ?? '' }
  })
  return { ...result, project: applyPlan(project, space, [...fixed, ...generated]) }
}
