export const IPV4_SIZE = 2 ** 32

export function ipToNumber(ip: string): number {
  const parts = ip.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) {
    throw new Error('Enter a valid IPv4 address, such as 192.168.10.1.')
  }
  return parts.reduce((value, part) => value * 256 + Number(part), 0)
}

export function numberToIp(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= IPV4_SIZE) {
    throw new Error('IPv4 address is outside 0.0.0.0 to 255.255.255.255.')
  }
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.')
}

export function assertPrefix(prefix: number): void {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error('Prefix length must be a whole number from 0 to 32.')
  }
}

export function prefixToMask(prefix: number): string {
  assertPrefix(prefix)
  return numberToIp(IPV4_SIZE - 2 ** (32 - prefix))
}

export function maskToPrefix(mask: string): number {
  const hostBits = Math.log2(IPV4_SIZE - ipToNumber(mask))
  if (!Number.isInteger(hostBits)) {
    throw new Error('Subnet mask must have contiguous network bits, such as 255.255.255.0.')
  }
  return 32 - hostBits
}

export function usableCapacity(prefix: number): number {
  assertPrefix(prefix)
  return prefix >= 31 ? 2 ** (32 - prefix) : 2 ** (32 - prefix) - 2
}

export function parseCidr(input: string) {
  const match = /^(\S+?)(?:\s*\/\s*|\s+)(\S+)$/.exec(input.trim())
  if (!match) throw new Error('Enter an IPv4 address with a prefix or mask, such as 192.168.10.0/24.')
  const address = match[1]!
  const suffix = match[2]!
  const ip = ipToNumber(address)
  const prefix = suffix.includes('.') ? maskToPrefix(suffix) : /^(0|[1-9]\d?)$/.test(suffix) ? Number(suffix) : NaN
  assertPrefix(prefix)
  const size = 2 ** (32 - prefix)
  const start = Math.floor(ip / size) * size
  const end = start + size - 1
  return {
    address, prefix, size, start, end,
    cidr: `${numberToIp(start)}/${prefix}`,
    mask: prefixToMask(prefix),
    network: numberToIp(start),
    broadcast: numberToIp(end),
    firstUsable: numberToIp(prefix >= 31 ? start : start + 1),
    lastUsable: numberToIp(prefix >= 31 ? end : end - 1),
    usableHosts: usableCapacity(prefix),
  }
}

export type Cidr = ReturnType<typeof parseCidr>

export function parseNetwork(input: string): Cidr {
  const block = parseCidr(input)
  if (ipToNumber(block.address) !== block.start) {
    throw new Error(`Use the aligned network address ${block.cidr}.`)
  }
  return block
}

export function contains(parent: Cidr, child: Cidr): boolean {
  return parent.start <= child.start && parent.end >= child.end
}

export function overlaps(a: Cidr, b: Cidr): boolean {
  return a.start <= b.end && b.start <= a.end
}

export function isUsableIp(ip: string, block: Cidr): boolean {
  const value = ipToNumber(ip)
  return value >= ipToNumber(block.firstUsable) && value <= ipToNumber(block.lastUsable)
}

export function prefixForHosts(hosts: number): number {
  if (!Number.isSafeInteger(hosts) || hosts < 1 || hosts > usableCapacity(0)) {
    throw new Error('Host requirement must be a whole number from 1 to 4,294,967,294, including the gateway.')
  }
  for (let prefix = 32; prefix >= 0; prefix--) {
    if (usableCapacity(prefix) >= hosts) return prefix
  }
  throw new Error('Host requirement exceeds IPv4 capacity.')
}

export function rangeToCidrs(start: number, end: number): string[] {
  numberToIp(start)
  numberToIp(end)
  if (start > end) throw new Error('Address range starts after it ends.')
  const result: string[] = []
  let cursor = start
  while (cursor <= end) {
    let size = 1
    while (size < IPV4_SIZE && cursor % (size * 2) === 0 && cursor + size * 2 - 1 <= end) size *= 2
    result.push(`${numberToIp(cursor)}/${32 - Math.log2(size)}`)
    cursor += size
  }
  return result
}
