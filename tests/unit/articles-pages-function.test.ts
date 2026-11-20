import { describe, it, expect } from 'vitest'
import { onRequestPost, sameSecret } from '../../functions/api/articles/[action]'

const call = (action: string, env: Record<string, unknown>, headers: Record<string, string> = {}) =>
  onRequestPost({ request: new Request(`https://x.test/api/articles/${action}`, { method: 'POST', headers }), env, params: { action } })

describe('articles Pages Function', () => {
  it('compares secrets safely', () => {
    expect(sameSecret('abc', 'abc')).toBe(true)
    expect(sameSecret('abc', 'abd')).toBe(false)
    expect(sameSecret('abc', 'ab')).toBe(false)
    expect(sameSecret('', '')).toBe(false)
  })
  it('says what is missing instead of crashing', async () => {
    const r = await call('angles', {})
    expect(r.status).toBe(503)
    expect(((await r.json()) as { error: string }).error).toContain('FIREBASE_SA_JSON')
  })
  it('rejects the scheduled run without the right secret', async () => {
    expect((await call('cron', { FIREBASE_SA_JSON: '{}', CRON_SECRET: 's3cret' })).status).toBe(401)
    expect((await call('cron', { FIREBASE_SA_JSON: '{}', CRON_SECRET: 's3cret' }, { 'x-cron-secret': 'wrong' })).status).toBe(401)
    expect((await call('cron', { FIREBASE_SA_JSON: '{}' }, { 'x-cron-secret': '' })).status).toBe(401)
  })
  it('requires an admin token for the admin actions and 404s unknown ones', async () => {
    expect((await call('angles', { FIREBASE_SA_JSON: '{}' })).status).toBe(401)
    expect((await call('nope', { FIREBASE_SA_JSON: '{}' })).status).toBe(404)
  })
})
