import { describe, it, expect } from 'vitest'
import { parseArticleOutput, parseAngles } from '../../src/shared/articles'

const body = '## Start here\n\n' + 'A real paragraph about mowing a lawn on a Saturday. '.repeat(12) + '\n\n## Quick answers\n\n### How often?\nWeekly in spring.'
const plain = `TITLE: How Often Should You Mow Your Lawn?\nSEO_TITLE: How often to mow your lawn\nMETA_DESCRIPTION: A short promise.\nKEYWORD: how often to mow\nEXCERPT: One sentence.\nCATEGORY: lawn-care\nIMAGE_QUERY: lawn mowing grass\n---\n${body}`

describe('parseArticleOutput is tolerant', () => {
  it('reads the exact format', () => {
    const r = parseArticleOutput(plain)
    expect(r?.title).toBe('How Often Should You Mow Your Lawn?')
    expect(r?.keyword).toBe('how often to mow')
    expect(r?.body).toContain('Quick answers')
  })
  it('reads bold labels, *** separators and a code fence', () => {
    const decorated = '```markdown\n' + plain.replace(/^([A-Z_]+):/gm, '**$1:**').replace('\n---\n', '\n***\n') + '\n```'
    const r = parseArticleOutput(decorated)
    expect(r?.title).toBe('How Often Should You Mow Your Lawn?')
    expect(r?.seoTitle).toBe('How often to mow your lawn')
    expect(r?.imageQuery).toBe('lawn mowing grass')
  })
  it('reads an answer with no separator line', () => {
    const r = parseArticleOutput(plain.replace('\n---\n', '\n\n'))
    expect(r?.title).toContain('Mow')
    expect(r?.body.startsWith('## Start here')).toBe(true)
  })
  it('falls back to the requested title when the model forgot the label', () => {
    const r = parseArticleOutput(plain.replace(/^TITLE:.*\n/m, ''), 'My requested title')
    expect(r?.title).toBe('My requested title')
  })
  it('still rejects an answer that is too short', () => {
    expect(parseArticleOutput('TITLE: x\n---\nshort')).toBeNull()
  })
  it('reads angles with bold labels and bullets', () => {
    const a = parseAngles('- **ANGLE:** What does it cost? | lawn mowing cost | price factors\n2. ANGLE: How to prepare your yard | prepare yard mowing | prep steps')
    expect(a).toHaveLength(2)
    expect(a[0].keyword).toBe('lawn mowing cost')
  })
})

import { deriveMeta } from '../../src/shared/articles'
describe('deriveMeta', () => {
  const text = '## Heading\n\nThe first sentence is about moving a fridge on a Saturday morning. The second one explains why a dolly matters for your floors and your back. A third sentence adds one more useful detail about doorways.\n\n- a list item\n\nMore text follows here.'
  it('builds a description and an excerpt from the first sentences', () => {
    const m = deriveMeta(text)
    expect(m.excerpt).toBe('The first sentence is about moving a fridge on a Saturday morning.')
    expect(m.description.length).toBeGreaterThanOrEqual(100)
    expect(m.description.length).toBeLessThanOrEqual(155)
    expect(m.description).not.toContain('#')
  })
  it('copes with an empty body', () => {
    expect(deriveMeta('')).toEqual({ description: '', excerpt: '' })
  })
})
