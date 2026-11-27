import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const attr = (re: RegExp) => html.match(re)?.[1] ?? ''

describe('home page keywords', () => {
  it('the title and description speak about what the site really offers, within search-result length', () => {
    const title = attr(/<title>([^<]*)<\/title>/).replace('%BRAND_NAME%', 'Helpnear')
    const desc = attr(/<meta name="description" content="([^"]*)"/)
    expect(title.length).toBeLessThanOrEqual(65)
    expect(desc.length).toBeLessThanOrEqual(165)
    expect(title.toLowerCase()).toContain('free')
    expect(desc.toLowerCase()).toContain('no platform fee')
  })
  it('has a keywords list made of real features, with no claims the site cannot back up', () => {
    const kw = attr(/<meta name="keywords" content="([^"]*)"/).toLowerCase()
    for (const k of ['no platform fee', 'pay the worker directly', 'local handyman near me', 'find home service jobs near me']) expect(kw, k).toContain(k)
    for (const bad of ['licensed', 'verified', 'background', 'instant', '24/7', 'insured']) expect(kw, bad).not.toContain(bad)
  })
  it('the crawlable page text (before JavaScript runs) lists the same features', () => {
    for (const t of ['Free home service requests', 'Quotes from local workers', 'No platform fee', 'Available in all 50 states']) expect(html).toContain(t)
  })
})
