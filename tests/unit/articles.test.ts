import { describe, expect, it } from 'vitest'
import { buildAnglesPrompt, buildArticlePrompt, checkArticle, cleanBody, fallbackKeyword, gatePasses, parseKeyword, parseQueue, parseQueueLine, findSimilar, makeSlug, parseAngles, parseArticleOutput, renderMarkdown, slugify, uniqueSlug, youtubeId } from '../../src/shared/articles'

describe('slugs', () => {
  it('turns a search phrase into a short readable link', () => {
    expect(slugify('How Much Does Lawn Mowing Cost?')).toBe('how-much-does-lawn-mowing-cost')
    expect(slugify('The best way to clean your gutters & downspouts')).toBe('best-way-clean-gutters-downspouts')
    expect(makeSlug('lawn mowing cost', 'Anything else')).toBe('lawn-mowing-cost')
    expect(makeSlug('', 'Pressure washing a driveway')).toBe('pressure-washing-driveway')
  })
  it('never exceeds 60 characters and never ends with a dash', () => {
    const s = slugify('word '.repeat(40)); expect(s.length).toBeLessThanOrEqual(60); expect(s.endsWith('-')).toBe(false)
  })
  it('adds a number when the link is taken', () => {
    expect(uniqueSlug('lawn-care-tips', ['lawn-care-tips'])).toBe('lawn-care-tips-2')
    expect(uniqueSlug('lawn-care-tips', ['lawn-care-tips', 'lawn-care-tips-2'])).toBe('lawn-care-tips-3')
    expect(uniqueSlug('fresh', ['other'])).toBe('fresh')
  })
})

describe('markdown renderer is safe', () => {
  it('renders headings, lists, emphasis and links', () => {
    const html = renderMarkdown('## Title\n\nHello **bold** and *soft* [lawn](/services/lawn-care/).\n\n- a\n- b\n\n1. one\n2. two')
    expect(html).toContain('<h2>Title</h2>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>soft</em>')
    expect(html).toContain('<a href="/services/lawn-care/">lawn</a>')
    expect(html).toContain('<ul><li>a</li><li>b</li></ul>')
    expect(html).toContain('<ol><li>one</li><li>two</li></ol>')
  })
  it('turns a lone H1 into an H2 so a page has one H1', () => { expect(renderMarkdown('# Big')).toBe('<h2>Big</h2>') })
  it('escapes HTML and blocks script, javascript: links and unknown image hosts', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) ![i](https://evil.example/a.png) ![ok](https://images.pexels.com/photos/1/a.jpeg)')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('evil.example')
    expect(html).toContain('src="https://images.pexels.com/photos/1/a.jpeg"')
  })
  it('opens outside links safely and embeds only real YouTube links in privacy mode', () => {
    expect(renderMarkdown('[a](https://example.com/x)')).toContain('rel="noopener nofollow ugc"')
    expect(renderMarkdown('@video(https://www.youtube.com/watch?v=dQw4w9WgXcQ)')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(renderMarkdown('@video(https://evil.example/watch?v=dQw4w9WgXcQ)')).toBe('')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })
})

describe('AI output', () => {
  const body = 'Saturday morning, the mower coughs and dies. '.repeat(40)
  const raw = `TITLE: How Much Does Lawn Mowing Cost?\nSEO_TITLE: Lawn mowing cost: what changes it\nMETA_DESCRIPTION: A plain guide.\nKEYWORD: Lawn Mowing Cost\nEXCERPT: Short.\nIMAGE_QUERY: lawn mower grass\n---\n# How Much Does Lawn Mowing Cost?\n\n${body} — and then some.\n\n\n\nMore.`
  it('parses the header lines and the body', () => {
    const p = parseArticleOutput(raw)!
    expect(p.title).toBe('How Much Does Lawn Mowing Cost?')
    expect(p.keyword).toBe('lawn mowing cost')
    expect(p.imageQuery).toBe('lawn mower grass')
    expect(p.body.startsWith('Saturday')).toBe(true)
  })
  it('rejects output without a title or with a tiny body', () => {
    expect(parseArticleOutput('no header here')).toBeNull()
    expect(parseArticleOutput('TITLE: x\n---\nshort')).toBeNull()
  })
  it('removes em dashes and triple blank lines', () => {
    expect(cleanBody('a — b\n\n\n\nc')).toBe('a, b\n\nc\n')
  })
  it('parses the angles list', () => {
    const a = parseAngles('ANGLE: What Changes the Price of Lawn Mowing | lawn mowing cost | wants to budget\n2. ANGLE: Mistakes When Hiring a Mower | hiring lawn mower | wants to avoid trouble\nrandom text')
    expect(a).toHaveLength(2)
    expect(a[0]).toEqual({ title: 'What Changes the Price of Lawn Mowing', keyword: 'lawn mowing cost', intent: 'wants to budget' })
  })
  it('puts the safety rules and the allowed links in the prompt', () => {
    const p = buildArticlePrompt({ title: 'T', keyword: 'lawn mowing cost', intent: '', services: [{ id: 'lawn-care', name: 'Lawn care' }], site: 'Helpnear' })
    expect(p.system).toContain('NEVER invent statistics')
    expect(p.system).toContain('/services/lawn-care/')
    expect(p.system).toContain('lawn mowing cost')
    expect(p.system).toContain('never say Helpnear checks'.replace('never', 'Never'))
    const a = buildAnglesPrompt({ topic: 'lawn care', count: 3, existingTitles: ['Old title'], site: 'Helpnear' })
    expect(a.user).toContain('Old title'); expect(a.user).toContain('exactly 3 lines')
  })
})

describe('quality checks', () => {
  const good = {
    title: 'How Much Does Lawn Mowing Cost?', slug: 'lawn-mowing-cost', keyword: 'lawn mowing cost', seoTitle: 's',
    description: 'x'.repeat(140),
    body: 'Thinking about lawn mowing cost this spring? Here is what matters.\n\n' + ['## What lawn mowing cost depends on', '## Ask these questions first', '## Mistakes to skip', '## When to hire help', '## Quick answers'].map((h) => `${h}\n\n${'word '.repeat(190)}\n`).join('\n') + '\nSee [lawn care](/services/lawn-care/) and [yard cleanup](/services/yard-cleanup/).',
    imageUrl: 'https://images.pexels.com/x.jpeg',
  }
  it('passes a well-formed article', () => { expect(checkArticle(good).filter((c) => !c.pass)).toEqual([]) })
  it('flags AI phrases, dollar amounts and missing pieces', () => {
    const bad = checkArticle({ ...good, body: 'Let us delve in. It costs $50 for a lawn.', imageUrl: '' })
    const failed = bad.filter((c) => !c.pass).map((c) => c.label)
    expect(failed).toEqual(expect.arrayContaining(['No stock AI phrases', 'No dollar amounts (check any you keep is true)', 'Has an image', 'Length of 900 words or more']))
  })
  it('detects near-duplicate titles', () => {
    expect(findSimilar('How Much Does Lawn Mowing Cost', ['How much does lawn mowing cost?', 'Roof repair guide'])).toEqual(['How much does lawn mowing cost?'])
    expect(findSimilar('Gutter cleaning mistakes', ['Lawn mowing price'])).toEqual([])
  })
})

describe('title queue lines', () => {
  it('reads a plain title, a title with a search phrase, and a per-title count', () => {
    expect(parseQueueLine('How to choose a lawn mowing service')).toEqual({ title: 'How to choose a lawn mowing service', keyword: '', count: null })
    expect(parseQueueLine('Gutter cleaning before winter | Gutter Cleaning')).toEqual({ title: 'Gutter cleaning before winter', keyword: 'gutter cleaning', count: null })
    expect(parseQueueLine('Gutter cleaning before winter | gutter cleaning | x2')).toMatchObject({ keyword: 'gutter cleaning', count: 2 })
    expect(parseQueueLine('Gutter cleaning before winter | x3')).toMatchObject({ keyword: '', count: 3 })
    expect(parseQueueLine('Gutter cleaning before winter | 1')).toMatchObject({ count: 1 })
  })
  it('strips list numbering and quotes, and refuses lines it cannot write an article for', () => {
    expect(parseQueueLine('12. "What to ask a handyman before hiring"')?.title).toBe('What to ask a handyman before hiring')
    expect(parseQueueLine('- Mowing tips for spring')?.title).toBe('Mowing tips for spring')
    expect(parseQueueLine('short')).toBeNull()
    expect(parseQueueLine('اكتب عن الحدائق والمقاولات')).toBeNull()
    expect(parseQueueLine('Title that is fine | | x9')?.count).toBeNull()
  })
  it('counts the lines it will drop', () => { expect(parseQueue('Good title about lawns\n\nno\nAnother good title here')).toMatchObject({ skipped: 1, items: [{ title: 'Good title about lawns' }, { title: 'Another good title here' }] }) })
  it('reads the AI search phrase and falls back to the title words', () => {
    expect(parseKeyword('KEYWORD: Lawn Mowing Service')).toBe('lawn mowing service')
    expect(parseKeyword('KEYWORD: lawn')).toBe('')
    expect(parseKeyword('I think the phrase is lawn care')).toBe('')
    expect(fallbackKeyword('How to Choose a Lawn Mowing Service!')).toBe('how to choose a lawn')
  })
  it('lets a weak photo, title length or meta length through the automatic gate but nothing else', () => {
    const ok = [{ label: 'a', pass: true }, { label: 'Has an image', pass: false, soft: true }]
    expect(gatePasses(ok)).toBe(true)
    expect(gatePasses([...ok, { label: 'Length', pass: false }])).toBe(false)
  })
})
