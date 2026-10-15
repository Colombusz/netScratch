import { describe, expect, it } from 'vitest'
import { contains, overlaps, parseNetwork } from './cidr'
import { allocateVlsm, freeSpace } from './vlsm'

const req = (name: string, hosts: number) => ({ id: name, name, hosts })

describe('VLSM allocation', () => {
  it('matches the office example, sorts descending, and leaves the correct free block', () => {
    const result = allocateVlsm('192.168.10.0/24', [req('Admin', 50), req('Guests', 20), req('Staff', 100)])
    expect(result.allocated.map((r) => [r.name, r.cidr, r.gatewayIp])).toEqual([
      ['Staff', '192.168.10.0/25', '192.168.10.1'],
      ['Admin', '192.168.10.128/26', '192.168.10.129'],
      ['Guests', '192.168.10.192/27', '192.168.10.193'],
    ])
    expect(result.free).toEqual(['192.168.10.224/27'])
    expect(result.failures).toEqual([])
  })
  it('returns the first two /25s and a clear failure for the third segment', () => {
    const result = allocateVlsm('192.168.10.0/24', [req('A', 100), req('B', 100), req('C', 50)])
    expect(result.allocated.map((r) => r.cidr)).toEqual(['192.168.10.0/25', '192.168.10.128/25'])
    expect(result.failures[0]?.message).toMatch(/Insufficient space for C: 50 usable addresses require a \/26/)
    expect(result.free).toEqual([])
  })
  it('skips reservations and chooses the lowest aligned boundary', () => {
    const result = allocateVlsm('10.0.0.0/24', [req('Staff', 100), req('Small', 20)], ['10.0.0.0/27'])
    expect(result.allocated.map((r) => r.cidr)).toEqual(['10.0.0.128/25', '10.0.0.32/27'])
    expect(result.free).toEqual(['10.0.0.64/26'])
  })
  it('reports fragmentation even when the total free addresses would suffice', () => {
    const result = allocateVlsm('10.0.0.0/24', [req('Large', 100), req('Small', 20)], ['10.0.0.0/32', '10.0.0.128/32'])
    expect(result.failures).toHaveLength(1)
    expect(result.allocated[0]?.cidr).toBe('10.0.0.32/27')
  })
  it('handles /0, /31, /32 and exhausted reservations without address enumeration', () => {
    expect(allocateVlsm('0.0.0.0/0', [req('All', 4_294_967_294)]).free).toEqual([])
    expect(allocateVlsm('255.255.255.254/31', [req('P2P', 2)]).allocated[0]?.gatewayIp).toBe('255.255.255.254')
    expect(allocateVlsm('255.255.255.255/32', [req('Host', 1)]).allocated[0]?.cidr).toBe('255.255.255.255/32')
    expect(allocateVlsm('10.0.0.0/24', [req('Host', 1)], ['10.0.0.0/24']).failures).toHaveLength(1)
    expect(allocateVlsm('10.0.0.0/24', []).free).toEqual(['10.0.0.0/24'])
  })
  it.each([
    ['10.0.1.0/24'], ['10.0.0.0/25', '10.0.0.64/26'], ['10.0.0.1/24'], ['bad'],
  ])('rejects invalid occupied ranges %j', (...reserved) => expect(() => freeSpace('10.0.0.0/24', reserved)).toThrow())
  it('rejects invalid and duplicate requirements without changing inputs', () => {
    const rows = [req('A', 100), req('A', 50)]
    expect(() => allocateVlsm('10.0.0.0/24', rows)).toThrow('unique')
    expect(() => allocateVlsm('10.0.0.0/24', [req('A', 0)])).toThrow()
    expect(() => allocateVlsm('10.0.0.0/24', [req('', 10)])).toThrow()
    expect(rows[0]?.hosts).toBe(100)
  })
  it('partitions the parent exactly across varied requirements and reservations', () => {
    const parent = parseNetwork('172.16.0.0/20')
    for (let seed = 1; seed <= 30; seed++) {
      const reserved = ['172.16.0.0/27', '172.16.8.0/24']
      const requirements = Array.from({ length: 25 }, (_, i) => req(String(i), ((i + 1) * seed * 37) % 200 + 1))
      const result = allocateVlsm(parent.cidr, requirements, reserved)
      const blocks = [...reserved, ...result.allocated.map((r) => r.cidr), ...result.free].map(parseNetwork)
      expect(blocks.reduce((sum, b) => sum + b.size, 0)).toBe(parent.size)
      blocks.forEach((block, i) => {
        expect(contains(parent, block)).toBe(true)
        blocks.slice(i + 1).forEach((other) => expect(overlaps(block, other)).toBe(false))
      })
      result.allocated.forEach((r) => expect(parseNetwork(r.cidr).usableHosts).toBeGreaterThanOrEqual(r.hosts))
    }
  })
})
