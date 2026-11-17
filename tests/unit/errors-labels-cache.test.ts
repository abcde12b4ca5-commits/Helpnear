import { FirebaseError } from 'firebase/app'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { friendlyError } from '../../src/lib/errors'
import { claimLabel } from '../../src/lib/labels'
import { cached, cachedPersistent, clearCache } from '../../src/lib/cache'
import type { ClaimDoc } from '../../src/lib/types'

describe('friendlyError', () => {
  const fe = (code: string) => new FirebaseError(code, 'raw technical message')

  it.each([
    ['auth/email-already-in-use', 'already exists'],
    ['auth/invalid-credential', 'Incorrect email or password'],
    ['auth/wrong-password', 'Incorrect email or password'],
    ['auth/user-not-found', 'Incorrect email or password'],
    ['auth/weak-password', 'at least 8 characters'],
    ['auth/too-many-requests', 'Too many attempts'],
    ['auth/popup-blocked', 'pop-ups'],
    ['auth/unauthorized-domain', 'not authorized'],
    ['auth/network-request-failed', 'Network error'],
    ['permission-denied', 'Wait a minute'],
    ['resource-exhausted', 'busy'],
    ['unavailable', 'temporarily unavailable'],
  ])('%s gives a readable message', (code, fragment) => {
    expect(friendlyError(fe(code))).toContain(fragment)
  })

  it('wrong password and unknown user give the SAME message (no account enumeration)', () => {
    expect(friendlyError(fe('auth/wrong-password'))).toBe(friendlyError(fe('auth/user-not-found')))
    expect(friendlyError(fe('auth/invalid-credential'))).toBe(friendlyError(fe('auth/user-not-found')))
  })
  it('never leaks the raw Firebase message or code to the user', () => {
    for (const code of ['auth/internal-error', 'weird-code', 'permission-denied']) {
      const m = friendlyError(fe(code))
      expect(m).not.toContain('raw technical message')
      expect(m).not.toContain(code)
    }
  })
  it('falls back for unknown Firebase codes, plain Errors, and non-errors', () => {
    expect(friendlyError(fe('something/new'))).toBe('Something went wrong. Please try again.')
    expect(friendlyError(new Error('Sign-ups are currently closed.'))).toBe('Sign-ups are currently closed.')
    for (const v of [null, undefined, 42, 'oops', {}]) expect(friendlyError(v)).toBe('Something went wrong. Please try again.')
  })
})

const claim = (over: Partial<ClaimDoc>): ClaimDoc => ({ status: 'accepted', clientAgreed: false, ...over }) as ClaimDoc

describe('claimLabel', () => {
  it('accepted, not yet agreed', () => {
    expect(claimLabel(claim({}), 'client')).toMatch(/agree to start/)
    expect(claimLabel(claim({}), 'worker')).toMatch(/Waiting for the client to agree/)
  })
  it('accepted and agreed', () => {
    expect(claimLabel(claim({ clientAgreed: true }), 'client')).toMatch(/Work in progress/)
    expect(claimLabel(claim({ clientAgreed: true }), 'worker')).toMatch(/mark it done/)
  })
  it('done asks the client to confirm', () => {
    expect(claimLabel(claim({ status: 'done' }), 'client')).toMatch(/Please confirm/)
    expect(claimLabel(claim({ status: 'done' }), 'worker')).toMatch(/Waiting for the client to confirm/)
  })
  it('confirmed, disputed and voided read the same for both sides', () => {
    for (const v of ['worker', 'client'] as const) {
      expect(claimLabel(claim({ status: 'confirmed' }), v)).toBe('Service done and confirmed.')
      expect(claimLabel(claim({ status: 'disputed' }), v)).toMatch(/admin/i)
      expect(claimLabel(claim({ status: 'voided' }), v)).toMatch(/Removed by an admin/)
    }
  })
  it('cancelled names who cancelled and the reason', () => {
    expect(claimLabel(claim({ status: 'cancelled', cancelledBy: 'worker', cancelReason: 'sick' }), 'client')).toBe('Cancelled by the worker: sick')
    expect(claimLabel(claim({ status: 'cancelled', cancelledBy: 'system', cancelReason: 'No agreed price' }), 'worker')).toBe('Cancelled by the system: No agreed price')
    expect(claimLabel(claim({ status: 'cancelled', cancelledBy: 'client' }), 'worker')).toBe('Cancelled by the client')
    expect(claimLabel(claim({ status: 'cancelled' }), 'worker')).toBe('Cancelled by the other side')
  })
  it('returns a non-empty string for every status and viewer', () => {
    for (const status of ['accepted', 'done', 'confirmed', 'cancelled', 'disputed', 'voided'] as const)
      for (const v of ['worker', 'client'] as const) expect(claimLabel(claim({ status }), v).length).toBeGreaterThan(5)
  })
})

describe('cached (TTL cache that protects the Firestore read budget)', () => {
  beforeEach(() => { vi.useFakeTimers(); clearCache() })
  afterEach(() => vi.useRealTimers())

  it('loads once and serves the cache until the TTL passes', async () => {
    const load = vi.fn().mockResolvedValue('v1')
    expect(await cached('k', 1000, load)).toBe('v1')
    expect(await cached('k', 1000, load)).toBe('v1')
    expect(load).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(999)
    await cached('k', 1000, load)
    expect(load).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2)
    await cached('k', 1000, load)
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('keeps different keys apart', async () => {
    expect(await cached('a', 1000, async () => 1)).toBe(1)
    expect(await cached('b', 1000, async () => 2)).toBe(2)
  })
  it('does not cache a failure', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok')
    await expect(cached('f', 1000, load)).rejects.toThrow('boom')
    expect(await cached('f', 1000, load)).toBe('ok')
  })
  it('clearCache(key) clears one entry, clearCache() clears all', async () => {
    const a = vi.fn().mockResolvedValue(1), b = vi.fn().mockResolvedValue(2)
    await cached('a', 1000, a); await cached('b', 1000, b)
    clearCache('a')
    await cached('a', 1000, a); await cached('b', 1000, b)
    expect(a).toHaveBeenCalledTimes(2); expect(b).toHaveBeenCalledTimes(1)
    clearCache()
    await cached('b', 1000, b)
    expect(b).toHaveBeenCalledTimes(2)
  })
})

describe('cachedPersistent (survives reloads, so returning visitors cost no Firestore read)', () => {
  const makeStorage = () => { const m = new Map<string, string>(); return { m, api: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size }, clear: () => m.clear() } } }
  let storage: ReturnType<typeof makeStorage>
  beforeEach(() => { vi.useFakeTimers(); storage = makeStorage(); vi.stubGlobal('localStorage', Object.assign(Object.create(null), storage.api, {})); clearCache() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('reuses the stored value after memory is gone, and reloads after expiry', async () => {
    const load = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2')
    await cachedPersistent('k', 1000, load)
    const saved = [...storage.m.entries()]
    clearCache() // memory and storage both cleared here, so restore only the storage to model a plain reload
    for (const [k, v] of saved) storage.m.set(k, v)
    expect(await cachedPersistent('k', 1000, load)).toBe('v1')
    expect(load).toHaveBeenCalledTimes(1)
    clearCache(); for (const [k, v] of saved) storage.m.set(k, v)
    vi.advanceTimersByTime(1001)
    expect(await cachedPersistent('k', 1000, load)).toBe('v2')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('ignores corrupt, expired-in-the-future and wrong-shaped stored values', async () => {
    const load = vi.fn().mockResolvedValue('fresh')
    storage.m.set('hn:cache:v1:a', '{not json')
    storage.m.set('hn:cache:v1:b', JSON.stringify({ at: Date.now() + 3_600_000, value: 'from-the-future' }))
    storage.m.set('hn:cache:v1:c', JSON.stringify({ value: 'no timestamp' }))
    for (const k of ['a', 'b', 'c']) expect(await cachedPersistent(k, 60_000, load)).toBe('fresh')
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('still works when storage throws (private mode, storage full, blocked cookies)', async () => {
    const boom = () => { throw new Error('denied') }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom, key: boom, length: 0 })
    const load = vi.fn().mockResolvedValue(7)
    expect(await cachedPersistent('x', 1000, load)).toBe(7)
    expect(await cachedPersistent('x', 1000, load)).toBe(7) // memory still caches
    expect(load).toHaveBeenCalledTimes(1)
    expect(() => clearCache('x')).not.toThrow()
    expect(() => clearCache()).not.toThrow()
  })

  it('clearCache(key) removes the stored copy too (admin edits show up immediately for the admin)', async () => {
    const load = vi.fn().mockResolvedValue('a')
    await cachedPersistent('cats', 60_000, load)
    expect([...storage.m.keys()]).toContain('hn:cache:v1:cats')
    clearCache('cats')
    expect([...storage.m.keys()]).not.toContain('hn:cache:v1:cats')
  })

  it('stores null (e.g. a legal page that does not exist) so a missing page is not re-read every time', async () => {
    const load = vi.fn().mockResolvedValue(null)
    await cachedPersistent('legal:nope', 60_000, load)
    const saved = [...storage.m.entries()]; clearCache(); for (const [k, v] of saved) storage.m.set(k, v)
    expect(await cachedPersistent('legal:nope', 60_000, load)).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
  })
})
