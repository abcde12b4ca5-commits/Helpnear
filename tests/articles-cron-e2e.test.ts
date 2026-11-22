/* eslint-disable @typescript-eslint/no-explicit-any */
// End to end, with fake Firebase and fake AI: what GitHub Actions triggers every hour (POST /api/articles/cron)
// must write and PUBLISH the next article from the admin's title list, 3 per day = one every 8 hours, and never twice in a row.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { resetAccessTokenCache } from '../worker/src/google'
import { onRequestPost } from '../functions/api/articles/[action]'

let pem = ''
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))))}\n-----END PRIVATE KEY-----`
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); resetAccessTokenCache() })

const sv = (v: string) => ({ stringValue: v })
const D = 'https://firestore.googleapis.com/v1/projects/helpnear-48ff5/databases/(default)/documents'
const filler = 'The dishwasher hums and a Saturday plan falls apart, and everyone has been there before. '.repeat(14)
const body = `Planning house cleaning cost? Here is the short version. ${filler}\n\n## How to compare house cleaning cost\n\n${filler} See [home cleaning](/services/cleaning/) and [lawn care](/services/lawn-care/).\n\n${[2, 3, 4, 5, 6].map((n) => `## Heading ${n} about the job\n\n${filler}\n`).join('\n')}`

function world(settings: Record<string, any>) {
  const w = { settings, saved: [] as any[], pings: [] as string[] }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const m = init?.method ?? 'GET'
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'at', expires_in: 3600 })
    if (url.includes('api.indexnow.org')) { w.pings.push(url); return new Response('ok') }
    if (url.startsWith(`${D}/articleSettings/main`)) {
      if (m === 'PATCH') { Object.assign(w.settings, JSON.parse(String(init!.body)).fields); return Response.json({}) }
      return Response.json({ name: 'x', fields: w.settings })
    }
    if (url.startsWith(`${D}/articles?`)) return Response.json({ documents: w.saved.map((a, i) => ({ name: `${D}/articles/A${i}`, fields: { title: a.title, slug: a.slug } })) })
    if (url.startsWith(`${D}/categories?`)) return Response.json({ documents: [{ name: `${D}/categories/cleaning`, fields: { name: sv('Cleaning'), enabled: { booleanValue: true }, riskLevel: sv('low') } }] })
    if (url === `${D}/articles` && m === 'POST') { w.saved.push(JSON.parse(String(init!.body)).fields); return Response.json({ name: `${D}/articles/NEW${w.saved.length}0000000` }) }
    return new Response('{}', { status: 404 })
  }))
  return w
}
const ai = { run: async (_m: string, input: { messages: { content: string }[] }) => {
  const user = input.messages[1].content
  if (user.includes('Answer with exactly one line')) return { response: 'KEYWORD: house cleaning cost' }
  const title = /Title to use or improve slightly: (.+)/.exec(user)?.[1] ?? 'A title'
  return { response: `TITLE: ${title}\nSEO_TITLE: ${title}\nMETA_DESCRIPTION: ${'A plain guide for neighbors. '.repeat(5).slice(0, 140)}\nKEYWORD: house cleaning cost\nEXCERPT: Short.\nIMAGE_QUERY: cleaning\n---\n${body}` }
} }
const env = { AI: ai, FIREBASE_SA_JSON: '', CRON_SECRET: 's3cret-value', INDEXNOW_KEY: 'k', SITE_URL: 'https://helpnear.pages.dev' }
const cron = (e = env, secret = 's3cret-value') => onRequestPost({ request: new Request('https://helpnear.pages.dev/api/articles/cron', { method: 'POST', headers: { 'x-cron-secret': secret } }), env: { ...e, FIREBASE_SA_JSON: JSON.stringify({ client_email: 'sa@x.iam', private_key: pem }) }, params: { action: 'cron' } })
const settings = () => ({ mode: sv('publish'), everyDays: { integerValue: '1' }, perDay: { integerValue: '3' }, perTitle: { integerValue: '1' }, topics: { arrayValue: { values: ['How Much Does House Cleaning Cost in the US? (Complete Price Guide)', 'How Often Should You Mow Your Lawn? (Seasonal Schedule)'].map(sv) } } })

describe('automatic publishing, end to end through POST /api/articles/cron', () => {
  it('publishes the first title right away, tells Bing, and removes it from the list', async () => {
    const w = world(settings())
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.parse('2026-11-22T10:00:00Z'))
    const res = await cron()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ran: true })
    expect(w.saved).toHaveLength(1)
    expect(w.saved[0].status.stringValue).toBe('published')
    expect(w.saved[0].title.stringValue).toContain('House Cleaning Cost')
    expect(w.saved[0].publishedAt).toBeTruthy()
    expect(w.pings[0]).toContain('https%3A%2F%2Fhelpnear.pages.dev%2Fblog%2F')
    expect(w.settings.topics.arrayValue.values.map((v: any) => v.stringValue)).toEqual(['How Often Should You Mow Your Lawn? (Seasonal Schedule)'])
  })
  it('runs every hour but writes only one article per 8 hours (3 a day)', async () => {
    const w = world(settings())
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.parse('2026-11-22T10:00:00Z'))
    await cron()
    for (const h of [11, 12, 17]) { vi.setSystemTime(Date.parse(`2026-11-22T${h}:00:00Z`)); expect(await (await cron()).json()).toMatchObject({ ran: false, reason: 'not due' }) }
    expect(w.saved).toHaveLength(1)
    vi.setSystemTime(Date.parse('2026-11-22T18:07:00Z'))
    expect(await (await cron()).json()).toMatchObject({ ran: true })
    expect(w.saved).toHaveLength(2)
    expect(w.saved.every((a) => a.status.stringValue === 'published')).toBe(true)
  })
  it('refuses a wrong or missing secret and writes nothing', async () => {
    const w = world(settings())
    expect((await cron(env, 'wrong')).status).toBe(401)
    expect((await cron({ ...env, CRON_SECRET: '' }, '')).status).toBe(401)
    expect(w.saved).toHaveLength(0)
  })
  it('writes nothing while the mode is Off', async () => {
    const w = world({ ...settings(), mode: sv('off') })
    expect(await (await cron()).json()).toMatchObject({ ran: false, reason: 'off' })
    expect(w.saved).toHaveLength(0)
  })
})
