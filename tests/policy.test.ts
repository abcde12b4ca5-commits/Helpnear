/* eslint-disable @typescript-eslint/no-explicit-any */
// Fair-use rules run by the scheduled worker. Run with: npm run test:worker (no emulator needed).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { resetAccessTokenCache, type Env } from '../worker/src/google'
import { runPolicy } from '../worker/src/policy'

let pem = ''
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const der = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(der)))}\n-----END PRIVATE KEY-----`
})
afterEach(() => { vi.unstubAllGlobals(); resetAccessTokenCache() })

const env = (): Env => ({ FIREBASE_SA_JSON: JSON.stringify({ client_email: 'sa@x.iam', private_key: pem }), TURNSTILE_SECRET: '', FIREBASE_PROJECT_ID: 'proj', FIREBASE_APP_ID: '', ALLOWED_ORIGINS: '', SITE_URL: 'https://x' })

const NOW = Date.parse('2026-11-10T12:00:00Z')
const D = 'projects/proj/databases/(default)/documents'
const s = (v: string) => ({ stringValue: v })
const b = (v: boolean) => ({ booleanValue: v })
const t = (ms: number) => ({ timestampValue: new Date(ms).toISOString() })
const claim = (r: string, w: string, fields: Record<string, unknown>) => ({ document: { name: `${D}/requests/${r}/claims/${w}`, updateTime: '2026-11-09T00:00:00.5Z', fields: { clientId: s('c1'), title: s('Paint a fence'), ...fields } } })

interface Call { method: string; url: string; body: Record<string, any> }
function fakeFirestore(opts: { config?: Record<string, unknown>; queries?: Record<string, unknown[]>; docs?: Record<string, unknown>; existing?: string[] }) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'at', expires_in: 3600 })
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, body })
    if (url.endsWith(':runQuery')) {
      const q = body.structuredQuery
      const coll = q.from[0].collectionId as string
      const key = coll === 'claims' ? `claims:${q.where.compositeFilter.filters[0].fieldFilter.value.stringValue}` : `${coll}:${q.where.fieldFilter.value.stringValue}`
      return Response.json((opts.queries?.[key] ?? []).length ? opts.queries![key] : [{ readTime: 'x' }])
    }
    if (method === 'GET') {
      const path = url.split('/documents/')[1]
      if (path === 'config/app') return Response.json({ name: `${D}/config/app`, fields: opts.config ?? {} })
      const found = opts.docs?.[path]
      return found ? Response.json(found) : new Response('{}', { status: 404 })
    }
    if (method === 'POST' && url.includes('documentId=')) return new Response('{}', { status: opts.existing?.some((id) => url.includes(id)) ? 409 : 200 })
    return new Response('{}', { status: 200 })
  }))
  return calls
}
const writes = (calls: Call[]) => calls.filter((c) => c.method !== 'GET' && !c.url.endsWith(':runQuery'))

describe('fair-use rules (scheduled)', () => {
  it('does nothing when switched off in Admin > Settings', async () => {
    const calls = fakeFirestore({ config: { autoRulesEnabled: b(false) } })
    expect((await runPolicy(env(), NOW)).disabled).toBe(true)
    expect(writes(calls)).toEqual([])
  })

  it('confirms a job automatically after the client stayed silent, guarded by the update time', async () => {
    const old = claim('R1', 'W1', { status: s('done'), doneAt: t(NOW - 8 * 86_400_000) })
    const calls = fakeFirestore({ queries: { 'claims:done': [old] } })
    const res = await runPolicy(env(), NOW)
    expect(res.autoConfirmed).toBe(1)
    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toContain('/requests/R1/claims/W1?')
    expect(patch.url).toContain('currentDocument.updateTime=')
    expect(patch.body.fields.status.stringValue).toBe('confirmed')
    expect(patch.body.fields.autoConfirmed.booleanValue).toBe(true)
    expect(calls.some((c) => c.url.includes('notifications/W1/items?documentId=R1_W1_autoconfirm'))).toBe(true)
  })

  it('skips the auto-confirm when the client acted at the same moment (precondition fails)', async () => {
    const old = claim('R1', 'W1', { status: s('done'), doneAt: t(NOW - 8 * 86_400_000) })
    const calls = fakeFirestore({ queries: { 'claims:done': [old] } })
    const original = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (init?.method === 'PATCH' ? new Response('{}', { status: 400 }) : original(url, init))))
    expect((await runPolicy(env(), NOW)).autoConfirmed).toBe(0)
    expect(calls.length).toBeGreaterThan(0)
  })

  it('releases a worker with no agreed price in time, frees the slot and records a strike', async () => {
    const stale = claim('R1', 'W1', { status: s('accepted'), clientAgreed: b(false), createdAt: t(NOW - 50 * 3_600_000) })
    const agreed = claim('R2', 'W2', { status: s('accepted'), clientAgreed: b(true), createdAt: t(NOW - 50 * 3_600_000) })
    const calls = fakeFirestore({
      queries: { 'claims:accepted': [stale, agreed] },
      docs: { 'requests/R1': { name: `${D}/requests/R1`, updateTime: '2026-11-09T00:00:00.9Z', fields: { claimsCount: { integerValue: '1' }, status: s('filled') } } },
    })
    const res = await runPolicy(env(), NOW)
    expect(res.released).toBe(1)
    expect(res.strikes).toBe(1)
    const commit = calls.find((c) => c.url.endsWith(':commit'))!
    expect(commit.body.writes).toHaveLength(2)
    expect(commit.body.writes[0].update.fields.cancelledBy.stringValue).toBe('system')
    expect(commit.body.writes[1].update.fields.claimsCount.integerValue).toBe('0')
    expect(commit.body.writes[1].update.fields.status.stringValue).toBe('open')
    expect(commit.body.writes[1].update.fields.lastWorkerId.stringValue).toBe('W1')
    expect(calls.some((c) => c.url.includes('strikes?documentId=R1_W1_noresp'))).toBe(true)
    expect(calls.some((c) => c.url.includes('R2_W2'))).toBe(false) // already agreed: untouched
  })

  it('does not record a no-response strike when the admin turned that off', async () => {
    const stale = claim('R1', 'W1', { status: s('accepted'), clientAgreed: b(false), createdAt: t(NOW - 50 * 3_600_000) })
    const calls = fakeFirestore({
      config: { noResponseStrikes: b(false) }, queries: { 'claims:accepted': [stale] },
      docs: { 'requests/R1': { name: `${D}/requests/R1`, fields: { claimsCount: { integerValue: '1' }, status: s('open') } } },
    })
    const res = await runPolicy(env(), NOW)
    expect(res.released).toBe(1)
    expect(res.strikes).toBe(0)
    expect(calls.some((c) => c.url.includes('strikes?documentId'))).toBe(false)
  })

  it('turns a late cancellation into a strike and freezes the user at the limit (numbers from settings)', async () => {
    const late = claim('R1', 'W1', { status: s('cancelled'), cancelledBy: s('worker'), cancelWasLate: b(true), cancelledAt: t(NOW - 3_600_000) })
    const early = claim('R3', 'W3', { status: s('cancelled'), cancelledBy: s('worker'), cancelWasLate: b(false), cancelledAt: t(NOW - 3_000_000) })
    const calls = fakeFirestore({
      config: { workerFreezeAt: { integerValue: '2' }, freezeDays: { integerValue: '5' } },
      queries: {
        'claims:cancelled': [late, early],
        'strikes:W1': [
          { document: { name: `${D}/strikes/a`, fields: { type: s('late_cancel'), createdAt: t(NOW - 5 * 86_400_000) } } },
          { document: { name: `${D}/strikes/b`, fields: { type: s('late_cancel'), createdAt: t(NOW) } } },
          { document: { name: `${D}/strikes/c`, fields: { type: s('warning'), createdAt: t(NOW) } } }, // warnings do not count
        ],
      },
      docs: { 'users/W1': { name: `${D}/users/W1`, fields: { status: s('active') } } },
    })
    const res = await runPolicy(env(), NOW)
    expect(res.strikes).toBe(1)
    expect(res.frozen).toBe(1)
    expect(calls.some((c) => c.url.includes('strikes?documentId=R1_W1_late'))).toBe(true)
    expect(calls.some((c) => c.url.includes('R3_W3'))).toBe(false)
    const freeze = calls.find((c) => c.method === 'PATCH' && c.url.includes('/users/W1?'))!
    expect(Date.parse(freeze.body.fields.frozenUntil.timestampValue)).toBe(NOW + 5 * 86_400_000)
    expect(calls.some((c) => c.method === 'PATCH' && c.url.includes('/meta/cron?'))).toBe(true)
  })

  it('flags the account for review at the review limit and does not extend an active freeze', async () => {
    const late = claim('R1', 'W1', { status: s('cancelled'), cancelledBy: s('worker'), cancelWasLate: b(true), cancelledAt: t(NOW - 3_600_000) })
    const four = ['a', 'b', 'c', 'd'].map((id) => ({ document: { name: `${D}/strikes/${id}`, fields: { type: s('late_cancel'), createdAt: t(NOW - 86_400_000) } } }))
    const calls = fakeFirestore({
      queries: { 'claims:cancelled': [late], 'strikes:W1': four },
      docs: { 'users/W1': { name: `${D}/users/W1`, fields: { frozenUntil: t(NOW + 86_400_000) } } },
    })
    const res = await runPolicy(env(), NOW)
    expect(res.flagged).toBe(1)
    expect(res.frozen).toBe(0)
    const patch = calls.find((c) => c.method === 'PATCH' && c.url.includes('/users/W1?'))!
    expect(patch.body.fields.needsReview.booleanValue).toBe(true)
    expect(patch.body.fields.frozenUntil).toBeUndefined()
  })

  it('repeating a run does not duplicate strikes (fixed ids answer 409)', async () => {
    const late = claim('R1', 'W1', { status: s('cancelled'), cancelledBy: s('client'), cancelWasLate: b(true), cancelledAt: t(NOW - 3_600_000) })
    fakeFirestore({ queries: { 'claims:cancelled': [late] }, existing: ['R1_W1_late'] })
    const res = await runPolicy(env(), NOW)
    expect(res.strikes).toBe(0)
  })

  it('stops cleanly when the subrequest budget is used up', async () => {
    const olds = [1, 2, 3, 4].map((i) => claim(`R${i}`, `W${i}`, { status: s('done'), doneAt: t(NOW - 9 * 86_400_000) }))
    fakeFirestore({ queries: { 'claims:done': olds } })
    const e = { ...env(), CRON_SUBREQUEST_LIMIT: '5' }
    const res = await runPolicy(e, NOW)
    expect(res.stoppedEarly).toBe(true)
  })
})
