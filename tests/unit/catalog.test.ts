import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/firebase', () => ({ db: {}, auth: {}, app: {}, WORKER_URL: '' })) // no real Firebase in unit tests
import { DEFAULT_CONFIG, findBlockedKeyword } from '../../src/lib/catalog'

describe('findBlockedKeyword (client-side, advisory filter)', () => {
  const kw = ['gun', 'cash only', 'c++', 'a.b']

  it('finds a whole word, case-insensitively, and returns the keyword as configured', () => {
    expect(findBlockedKeyword('Need a GUN safe moved', kw)).toBe('gun')
    expect(findBlockedKeyword('gun', kw)).toBe('gun')
    expect(findBlockedKeyword('hello, gun!', kw)).toBe('gun')
  })
  it('does not flag words that merely contain the keyword (no Scunthorpe problem)', () => {
    expect(findBlockedKeyword('begun the work', kw)).toBeNull()
    expect(findBlockedKeyword('gunmetal paint', kw)).toBeNull()
    expect(findBlockedKeyword('burgundy walls', kw)).toBeNull()
  })
  it('matches multi-word keywords', () => {
    expect(findBlockedKeyword('payment is Cash Only please', kw)).toBe('cash only')
  })
  it('treats regex characters in a keyword literally (no crash, no wildcard)', () => {
    expect(findBlockedKeyword('we use c++ here', kw)).toBe('c++')
    expect(findBlockedKeyword('axb', kw)).toBeNull() // "a.b" must not behave as a regex wildcard
    expect(findBlockedKeyword('a.b', kw)).toBe('a.b')
    expect(() => findBlockedKeyword('x', ['(', '[', '\\', '*', '?', '$', '^', '|'])).not.toThrow()
  })
  it('handles empty input', () => {
    expect(findBlockedKeyword('', kw)).toBeNull()
    expect(findBlockedKeyword('anything', [])).toBeNull()
  })
  it('KNOWN LIMIT: obfuscation such as "g u n" or "g.u.n" is not caught (documented: reports and admins are the backstop)', () => {
    expect(findBlockedKeyword('g u n', kw)).toBeNull()
    expect(findBlockedKeyword('guuun', kw)).toBeNull()
  })
})

describe('DEFAULT_CONFIG (used when config/app does not exist yet)', () => {
  it('opens sign-up and keeps maintenance off', () => {
    expect(DEFAULT_CONFIG.signupOpen).toBe(true)
    expect(DEFAULT_CONFIG.maintenanceMode).toBe(false)
  })
  it('respects the limits that the Firestore rules enforce', () => {
    expect(DEFAULT_CONFIG.maxWorkersPerRequest).toBeGreaterThanOrEqual(1)
    expect(DEFAULT_CONFIG.maxWorkersPerRequest).toBeLessThanOrEqual(10) // rules cap
    expect(DEFAULT_CONFIG.maxCategoriesPerWorker).toBeLessThanOrEqual(5) // rules cap
    expect(DEFAULT_CONFIG.requestExpiryHours).toBeLessThanOrEqual(160) // requests.ts keeps under the 7-day rules cap
  })
  it('keeps paid features off and fair-use rules on by default', () => {
    expect(DEFAULT_CONFIG.feesEnabled).toBe(false)
    expect(DEFAULT_CONFIG.autoRulesEnabled).toBe(true)
  })
  it('has strike thresholds in a sensible order (review is never below freeze)', () => {
    expect(DEFAULT_CONFIG.clientReviewAt).toBeGreaterThanOrEqual(DEFAULT_CONFIG.clientFreezeAt)
    expect(DEFAULT_CONFIG.workerReviewAt).toBeGreaterThanOrEqual(DEFAULT_CONFIG.workerFreezeAt)
  })
})
