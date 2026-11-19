/* eslint-disable @typescript-eslint/no-explicit-any */
// The automatic article queue: titles from the admin panel, articles per day, articles per title, publish modes. Run with: npm run test:worker (no emulator needed).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { resetAccessTokenCache, type Env } from '../worker/src/google'
import { intervalMs, isDue, readSettings, runArticleJob } from '../worker/src/articles'

let pem = ''
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const der = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(der)))}\n-----END PRIVATE KEY-----`
})
afterEach(() => { vi.unstubAllGlobals(); resetAccessTokenCache() })

const HOUR = 3_600_000
const NOW = Date.parse('2026-11-10T12:00:00Z')
const sv = (v: string) => ({ stringValue: v })
const list = (xs: string[]) => ({ arrayValue: { values: xs.map(sv) } })

// A body that passes every quality check for the keyword "lawn mowing service".
const goodBody = (kw: string) => {
  const filler = 'The mower coughs and dies on a Saturday morning, and everyone has been there before. '.repeat(14)
  const h = (n: number) => `## Heading number ${n} about the work\n\n${filler}\n`
  return `Thinking about a ${kw}? Here is the short version. ${filler}\n\n## How to pick a ${kw}\n\n${filler} See [lawn care](/services/lawn-care/) and [hedge trimming](/services/hedges/).\n\n${[2, 3, 4, 5, 6].map(h).join('\n')}`
}
const articleText = (title: string, kw: string, body: string) => `TITLE: ${title}\nSEO_TITLE: ${title}\nMETA_DESCRIPTION: ${'A plain guide for neighbors. '.repeat(5).slice(0, 140)}\nKEYWORD: ${kw}\nEXCERPT: Short.\nIMAGE_QUERY: lawn mower\n---\n${body}`

interface World { settings: Record<string, any>; saved: { body: any }[]; existing: { slug: string; title: string }[]; aiCalls: { system: string; user: string }[] }
function setup(settings: Record<string, any>, opts: { article?: (user: string) => string; existing?: { slug: string; title: string }[]; failAI?: boolean } = {}): { env: Env; world: World } {
  const world: World = { settings: { ...settings }, saved: [], existing: opts.existing ?? [], aiCalls: [] }
  const D = 'https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents'
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'at', expires_in: 3600 })
    if (url.startsWith(`${D}/articleSettings/main`)) {
      if (method === 'PATCH') { Object.assign(world.settings, JSON.parse(String(init!.body)).fields); return Response.json({}) }
      return Response.json({ name: 'x', fields: world.settings })
    }
    if (url.startsWith(`${D}/articles?`)) return Response.json({ documents: world.existing.map((a, i) => ({ name: `${D}/articles/E${i}`, fields: { title: sv(a.title), slug: sv(a.slug) } })) })
    if (url.startsWith(`${D}/categories?`)) return Response.json({ documents: [{ name: `${D}/categories/lawn-care`, fields: { name: sv('Lawn care'), enabled: { booleanValue: true }, riskLevel: sv('low') } }] })
    if (url === `${D}/articles` && method === 'POST') { const body = JSON.parse(String(init!.body)); world.saved.push({ body: body.fields }); return Response.json({ name: `${D}/articles/NEW${world.saved.length}0000000` }) }
    return new Response('{}', { status: 404 })
  }))
  const ai = { run: async (_m: string, input: { messages: { content: string }[] }) => {
    const [system, user] = [input.messages[0].content, input.messages[1].content]
    world.aiCalls.push({ system, user })
    if (opts.failAI) return { response: 'garbage' }
    if (user.includes('Answer with exactly one line')) return { response: 'KEYWORD: lawn mowing service' }
    if (system.includes('plan blog articles')) return { response: 'ANGLE: Lawn Mowing Service Mistakes People Make | lawn mowing mistakes | what goes wrong' }
    const title = /Title to use or improve slightly: (.+)/.exec(user)?.[1] ?? 'A title'
    const kw = /Search phrase: (.+)/.exec(user)?.[1] ?? 'lawn mowing service'
    return { response: opts.article ? opts.article(user) : articleText(title, kw, goodBody(kw)) }
  } }
  return { env: { AI: ai, FIREBASE_SA_JSON: JSON.stringify({ client_email: 'sa@x.iam', private_key: pem }), TURNSTILE_SECRET: '', FIREBASE_PROJECT_ID: 'proj', FIREBASE_APP_ID: '', ALLOWED_ORIGINS: '', SITE_URL: 'https://x' } as unknown as Env, world }
}
const base = (over: Record<string, any> = {}) => ({ mode: sv('draft'), everyDays: { integerValue: '1' }, perDay: { integerValue: '2' }, perTitle: { integerValue: '1' }, topics: list(['How to Choose a Lawn Mowing Service', 'Gutter cleaning before winter | gutter cleaning | x2']), lastRunAt: { timestampValue: new Date(NOW - 24 * HOUR).toISOString() }, ...over })
const queueOf = (w: World) => (w.settings.topics?.arrayValue?.values ?? []).map((v: any) => v.stringValue)
const field = (w: World, i: number, k: string) => w.saved[i].body[k]?.stringValue

describe('articles per day', () => {
  it('spreads the day evenly: 3 per day is one article every 8 hours, 1 per 7 days is weekly', () => {
    const three = readSettings({ perDay: { integerValue: '3' }, everyDays: { integerValue: '1' }, mode: sv('draft') })
    expect(intervalMs(three)).toBe(8 * HOUR)
    expect(isDue({ ...three, lastRunAt: NOW }, NOW + 7 * HOUR)).toBe(false)
    expect(isDue({ ...three, lastRunAt: NOW }, NOW + 8 * HOUR)).toBe(true)
    expect(intervalMs(readSettings({ perDay: { integerValue: '1' }, everyDays: { integerValue: '7' } }))).toBe(7 * 24 * HOUR)
  })
  it('clamps the numbers the panel can send and defaults old settings (no perDay) to one per period', () => {
    expect(readSettings({ perDay: { integerValue: '99' }, perTitle: { integerValue: '9' } })).toMatchObject({ perDay: 5, perTitle: 3 })
    expect(readSettings({ perDay: { integerValue: '0' } }).perDay).toBe(1)
    expect(readSettings({ mode: sv('draft'), everyDays: { integerValue: '2' } })).toMatchObject({ perDay: 1, perTitle: 1, everyDays: 2 })
    expect(readSettings({ mode: sv('checked') }).mode).toBe('checked')
  })
})

describe('the title queue', () => {
  it('writes the first title of the list as given, with an AI search phrase, and removes it from the queue', async () => {
    const { env, world } = setup(base())
    const r = await runArticleJob(env, NOW)
    expect(r.ran).toBe(true)
    expect(field(world, 0, 'title')).toBe('How to Choose a Lawn Mowing Service')
    expect(field(world, 0, 'keyword')).toBe('lawn mowing service')
    expect(field(world, 0, 'status')).toBe('draft')
    expect(queueOf(world)).toEqual(['Gutter cleaning before winter | gutter cleaning | x2'])
  })
  it('does nothing when the timer has not run out, when off, and runs anyway with force', async () => {
    const recent = base({ lastRunAt: { timestampValue: new Date(NOW - 2 * HOUR).toISOString() } })
    const a = setup(recent)
    expect(await runArticleJob(a.env, NOW)).toMatchObject({ ran: false, reason: 'not due' })
    expect(a.world.saved).toHaveLength(0)
    expect((await runArticleJob(a.env, NOW, { force: true })).ran).toBe(true)
    const off = setup(base({ mode: sv('off') }))
    expect(await runArticleJob(off.env, NOW, { force: true })).toMatchObject({ ran: false, reason: 'off' })
  })
  it('writes several different articles for one title, taking the extra angles from the AI, then moves on', async () => {
    const { env, world } = setup(base({ topics: list(['Gutter cleaning before winter | gutter cleaning | x2', 'Second title to write']) }))
    await runArticleJob(env, NOW)
    expect(field(world, 0, 'title')).toBe('Gutter cleaning before winter')
    expect(queueOf(world)[0]).toContain('Gutter cleaning')
    expect(world.settings.headProgress.integerValue).toBe('1')
    await runArticleJob(env, NOW + 12 * HOUR)
    expect(world.saved).toHaveLength(2)
    expect(field(world, 1, 'title')).not.toBe('Gutter cleaning before winter')
    expect(world.aiCalls.some((c) => c.system.includes('plan blog articles'))).toBe(true)
    expect(queueOf(world)).toEqual(['Second title to write'])
    expect(world.settings.headProgress.integerValue).toBe('0')
  })
  it('uses the default per-title number from the panel when a line has no x2', async () => {
    const { env, world } = setup(base({ perTitle: { integerValue: '2' }, topics: list(['How to Choose a Lawn Mowing Service']) }))
    await runArticleJob(env, NOW)
    expect(queueOf(world)).toHaveLength(1)
    await runArticleJob(env, NOW + 12 * HOUR)
    expect(queueOf(world)).toHaveLength(0)
  })
  it('drops lines it cannot use and picks its own topic when the list is empty', async () => {
    const { env, world } = setup(base({ topics: list(['short', 'اكتب عن الحدائق بالعربي', 'Real title about lawn care']) }))
    await runArticleJob(env, NOW)
    expect(field(world, 0, 'title')).toBe('Real title about lawn care')
    expect(queueOf(world)).toEqual([])
    const empty = setup(base({ topics: list([]) }))
    expect((await runArticleJob(empty.env, NOW)).ran).toBe(true)
  })
  it('skips a title that fails 3 times so one bad title cannot block the list, and retries sooner than a full interval', async () => {
    const { env, world } = setup(base(), { failAI: true })
    for (let i = 0; i < 3; i++) {
      const r = await runArticleJob(env, NOW + i * 13 * HOUR)
      expect(r.ran).toBe(false)
    }
    expect(queueOf(world)).toEqual(['Gutter cleaning before winter | gutter cleaning | x2'])
    expect(world.settings.lastError.stringValue).toMatch(/Skipped/)
    expect(world.saved).toHaveLength(0)
  })
})

describe('publish modes', () => {
  it('draft mode never publishes; publish mode publishes; the same title as an existing article stays a draft', async () => {
    const d = setup(base({ mode: sv('draft') })); await runArticleJob(d.env, NOW)
    expect(field(d.world, 0, 'status')).toBe('draft')
    const p = setup(base({ mode: sv('publish') })); await runArticleJob(p.env, NOW)
    expect(field(p.world, 0, 'status')).toBe('published')
    const dup = setup(base({ mode: sv('publish') }), { existing: [{ slug: 'x-y-z', title: 'How to Choose a Lawn Mowing Service' }] }); await runArticleJob(dup.env, NOW)
    expect(field(dup.world, 0, 'status')).toBe('draft')
  })
  it('"publish only if the checks pass" publishes a good article and keeps a weak one as a draft', async () => {
    const good = setup(base({ mode: sv('checked') })); await runArticleJob(good.env, NOW)
    expect(field(good.world, 0, 'status')).toBe('published')
    const weak = setup(base({ mode: sv('checked') }), { article: (u) => articleText('How to Choose a Lawn Mowing Service', 'lawn mowing service', 'Too short. '.repeat(60) + `\n\n(${u.length})`) })
    await runArticleJob(weak.env, NOW)
    expect(field(weak.world, 0, 'status')).toBe('draft')
  })
})
