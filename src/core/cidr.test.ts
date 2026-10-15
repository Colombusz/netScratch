import { describe, expect, it } from 'vitest'
import { contains, ipToNumber, isUsableIp, maskToPrefix, numberToIp, overlaps, parseCidr, parseNetwork, prefixForHosts, prefixToMask, rangeToCidrs, usableCapacity } from './cidr'

describe('IPv4 CIDR calculations', () => {
  it('matches the specified /25 example', () => {
    expect(parseCidr('192.168.10.0/25')).toMatchObject({
      network: '192.168.10.0', broadcast: '192.168.10.127', mask: '255.255.255.128',
      firstUsable: '192.168.10.1', lastUsable: '192.168.10.126', usableHosts: 126,
    })
  })
  it.each(['192.168.10.99/24', '192.168.10.99/255.255.255.0', ' 192.168.10.99 255.255.255.0 ', '192.168.10.99 / 24'])('accepts %s and normalizes its network', (input) => {
    expect(parseCidr(input).cidr).toBe('192.168.10.0/24')
  })
  it('handles /31 and /32 without reserving boundary addresses', () => {
    expect(parseCidr('255.255.255.254/31')).toMatchObject({ firstUsable: '255.255.255.254', lastUsable: '255.255.255.255', usableHosts: 2 })
    expect(parseCidr('255.255.255.255/32')).toMatchObject({ firstUsable: '255.255.255.255', lastUsable: '255.255.255.255', usableHosts: 1 })
    expect(isUsableIp('255.255.255.255', parseCidr('255.255.255.254/31'))).toBe(true)
    expect(isUsableIp('0.0.0.0', parseCidr('0.0.0.0/32'))).toBe(true)
  })
  it('handles /0 and high-bit addresses without signed overflow', () => {
    expect(parseCidr('240.1.2.3/0')).toMatchObject({ cidr: '0.0.0.0/0', size: 4_294_967_296, usableHosts: 4_294_967_294, broadcast: '255.255.255.255' })
    expect(ipToNumber('255.255.255.255')).toBe(4_294_967_295)
    expect(numberToIp(2 ** 31)).toBe('128.0.0.0')
  })
  it.each(Array.from({ length: 33 }, (_, i) => i))('round trips prefix /%i through its mask and boundaries', (prefix) => {
    expect(maskToPrefix(prefixToMask(prefix))).toBe(prefix)
    const block = parseCidr(`203.0.113.125/${prefix}`)
    expect(block.end - block.start + 1).toBe(2 ** (32 - prefix))
    expect(ipToNumber(block.firstUsable)).toBeLessThanOrEqual(ipToNumber(block.lastUsable))
    expect(parseNetwork(block.cidr).cidr).toBe(block.cidr)
  })
  it.each(['', '192.168.1.1', '256.0.0.1/24', '-1.0.0.1/24', '192.168.1/24', '192.168.1.1.1/24', '01.2.3.4/24', '1e2.0.0.1/24', '1.2.3.4/33', '1.2.3.4/-1', '1.2.3.4/24.5', '1.2.3.4/024', '1.2.3.4/NaN', '1.2.3.4/255.0.255.0', '1.2.3.4/255.255.255.1', '1.2.3.4/24/24', '1.2.3.4 / 24 extra'])('rejects invalid input %s', (input) => {
    expect(() => parseCidr(input)).toThrow()
  })
  it.each([-1, 2 ** 32, 1.5, NaN, Infinity])('rejects invalid numeric IPv4 %s', (input) => expect(() => numberToIp(input)).toThrow())
  it.each([-1, 33, 1.5, NaN])('rejects invalid prefix %s', (prefix) => expect(() => usableCapacity(prefix)).toThrow())
  it('rejects unaligned network input and boundary gateways', () => {
    expect(() => parseNetwork('192.168.10.1/24')).toThrow('192.168.10.0/24')
    const block = parseNetwork('192.168.10.0/24')
    expect(isUsableIp('192.168.10.0', block)).toBe(false)
    expect(isUsableIp('192.168.10.255', block)).toBe(false)
    expect(isUsableIp('192.168.11.1', block)).toBe(false)
    expect(isUsableIp('192.168.10.1', block)).toBe(true)
  })
  it.each([[1, 32], [2, 31], [3, 29], [6, 29], [7, 28], [20, 27], [50, 26], [100, 25], [254, 24], [255, 23], [4_294_967_294, 0]])('fits %i usable hosts in /%i', (hosts, prefix) => {
    expect(prefixForHosts(hosts)).toBe(prefix)
  })
  it.each([0, -1, 1.5, NaN, Infinity, 4_294_967_295])('rejects invalid host requirement %s', (hosts) => expect(() => prefixForHosts(hosts)).toThrow())
  it('tests containment and inclusive overlap', () => {
    const parent = parseNetwork('10.0.0.0/24')
    expect(contains(parent, parseNetwork('10.0.0.128/25'))).toBe(true)
    expect(contains(parent, parseNetwork('10.0.1.0/24'))).toBe(false)
    expect(overlaps(parent, parseNetwork('10.0.0.255/32'))).toBe(true)
    expect(overlaps(parent, parseNetwork('10.0.1.0/24'))).toBe(false)
  })
  it('summarizes ranges into minimal aligned blocks including the full IPv4 space', () => {
    expect(rangeToCidrs(0, 2 ** 32 - 1)).toEqual(['0.0.0.0/0'])
    expect(rangeToCidrs(1, 6)).toEqual(['0.0.0.1/32', '0.0.0.2/31', '0.0.0.4/31', '0.0.0.6/32'])
    expect(() => rangeToCidrs(6, 1)).toThrow('starts after')
  })
})
