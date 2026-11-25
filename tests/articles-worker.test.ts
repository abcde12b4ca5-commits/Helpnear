import { describe, expect, it } from 'vitest'
import { composeArticle, isDue, readSettings, searchPhotos } from '../worker/src/articles'
import type { Env } from '../worker/src/google'

const body = ('Saturday morning, the mower coughs and dies. ' + 'It happens to everyone. ').repeat(30)
const aiText = `TITLE: What Changes the Price of Lawn Mowing\nSEO_TITLE: Lawn mowing cost\nMETA_DESCRIPTION: A plain guide.\nKEYWORD: lawn mowing cost\nEXCERPT: Short.\nIMAGE_QUERY: lawn mower\n---\n${body}`
const env = (ai: unknown, extra: Partial<Env> = {}): Env => ({ AI: { run: async () => ai }, FIREBASE_PROJECT_ID: 'p', SITE_URL: 'https://site.example', ...extra } as unknown as Env)
const ctx = { services: [{ id: 'lawn-care', name: 'Lawn care' }], takenSlugs: ['lawn-mowing-cost'], otherTitles: [] as string[] }
const spec = { title: 'What Changes the Price of Lawn Mowing', keyword: 'lawn mowing cost', intent: '' }

describe('composeArticle', () => {
  it('turns the AI answer into a draft with a keyword link that is not already taken', async () => {
    const d = await composeArticle(env({ response: aiText }), spec, ctx)
    expect(d.title).toBe('What Changes the Price of Lawn Mowing')
    expect(d.slug).toBe('lawn-mowing-cost-2')
    expect(d.keyword).toBe('lawn mowing cost')
    expect(d.imageUrl).toBe('')
  })
  it('retries once when the first answer is malformed, then gives up with a clear error', async () => {
    let calls = 0
    const e = env(null); e.AI = { run: async () => (++calls === 1 ? { response: 'garbage' } : { response: aiText }) }
    expect((await composeArticle(e, spec, ctx)).title).toContain('Lawn Mowing')
    expect(calls).toBe(3) // 1 garbage + 1 good answer + 1 pass to lengthen it (the good answer is under 900 words)
    await expect(composeArticle(env({ response: 'garbage' }), spec, ctx)).rejects.toThrow(/expected format/)
  })
  it('asks once for a longer version when the article is under 900 words, and keeps the longer one', async () => {
    const longer = `${aiText}\n\n${Array.from({ length: 80 }, () => 'More practical detail about the job, the typical price and what to ask first.').join(' ')}`
    let calls = 0
    const e = env(null); e.AI = { run: async () => ({ response: ++calls === 1 ? aiText : longer }) }
    const d = await composeArticle(e, spec, ctx)
    expect(calls).toBe(2)
    expect(d.body).toContain('More practical detail')
  })
  it('keeps the first article when the longer version fails or is not longer', async () => {
    let calls = 0
    const e = env(null); e.AI = { run: async () => { if (++calls === 1) return { response: aiText }; throw new Error('quota') } }
    expect((await composeArticle(e, spec, ctx)).body).not.toContain('More practical detail')
    expect(calls).toBe(2)
    let n = 0
    const f = env(null); f.AI = { run: async () => ({ response: ++n === 1 ? aiText : 'garbage' }) }
    expect((await composeArticle(f, spec, ctx)).title).toContain('Lawn Mowing')
  })
  it('explains how to connect the AI when the binding is missing', async () => {
    const e = env(null); delete e.AI
    await expect(composeArticle(e, spec, ctx)).rejects.toThrow(/\[ai\] binding/)
  })
})

describe('schedule', () => {
  const s = readSettings({ mode: { stringValue: 'draft' }, everyDays: { integerValue: '2' }, topics: { arrayValue: { values: [{ stringValue: 'gutters' }] } } as never, lastRunAt: { timestampValue: '2026-01-01T00:00:00Z' } })
  it('reads the settings document', () => { expect(s).toMatchObject({ mode: 'draft', everyDays: 2, topics: ['gutters'] }) })
  it('is due only after the chosen number of days, and never when off', () => {
    const t = Date.parse('2026-01-01T00:00:00Z')
    expect(isDue(s, t + 1 * 86_400_000)).toBe(false)
    expect(isDue(s, t + 2 * 86_400_000)).toBe(true)
    expect(isDue({ ...s, mode: 'off' }, t + 99 * 86_400_000)).toBe(false)
  })
  it('treats a missing or odd mode as off and clamps the period', () => {
    expect(readSettings({ mode: { stringValue: 'weird' } }).mode).toBe('off')
    expect(readSettings({ everyDays: { integerValue: '999' } }).everyDays).toBe(30)
  })
})

describe('photos', () => {
  it('returns nothing without a Pexels key', async () => { expect(await searchPhotos(env(null), 'lawn')).toEqual([]) })
})
