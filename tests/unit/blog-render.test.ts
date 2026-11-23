import { describe, expect, it } from 'vitest'
import { renderIndex, renderPost, shellResponse, type Post, type PostCard } from '../../functions/_lib/blog'

const tpl = '<html><head><title>%%TITLE%%</title><meta name="description" content="%%DESC%%"><meta name="robots" content="index,follow"><meta property="og:image" content="https://site.example/img/handy.jpg"><link rel="canonical" href="https://site.example%%PATH%%"><script type="application/ld+json">"%%JSONLD%%"</script></head><body><main>%%BODY%%</main></body></html>'
const env = { ASSETS: { fetch: async () => new Response(tpl, { headers: { 'content-security-policy': "default-src 'self'", 'x-robots-tag': 'noindex', 'content-type': 'application/octet-stream' } }) } }
const post: Post = { slug: 'lawn-mowing-cost', title: 'What Changes the Price of <Lawn> Mowing', excerpt: 'e', imageUrl: 'https://images.pexels.com/photos/1/a.jpeg', imageAlt: 'a "lawn"', publishedAt: '2026-11-01T10:00:00Z', description: 'd', seoTitle: 'Lawn mowing cost $5', body: '## Hello\n\nText with [lawn care](/services/lawn-care/).\n\n<script>alert(1)</script>', imageCredit: 'Photo by A on Pexels', imageCreditUrl: 'https://www.pexels.com/photo/1', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', updatedAt: '2026-11-02T10:00:00Z', category: 'lawn-care', keyword: 'lawn mowing cost' }
const others: PostCard[] = [{ slug: 'other-one', title: 'Other one', excerpt: '', imageUrl: '', imageAlt: '', publishedAt: '2026-10-01T00:00:00Z', category: 'lawn-care' }, { slug: 'lawn-mowing-cost', title: 'Same', excerpt: '', imageUrl: '', imageAlt: '', publishedAt: '', category: 'lawn-care' }]

describe('blog pages', () => {
  it('renders an article with one H1, hero image with credit, video, body, links to more articles, and structured data', async () => {
    const page = renderPost(post, others, 'Helpnear', 'https://site.example')
    const res = await shellResponse(env, 'https://site.example', { ...page, path: '/blog/lawn-mowing-cost' }, 'Helpnear')
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html.match(/<h1>/g)).toHaveLength(1)
    expect(html).toContain('<title>Lawn mowing cost $5</title>')
    expect(html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(html).toContain('Photo by A on Pexels')
    expect(html).toContain('href="/blog/other-one"')
    expect(html).not.toContain('href="/blog/lawn-mowing-cost">Same')
    expect(html).toContain('<link rel="canonical" href="https://site.example/blog/lawn-mowing-cost">')
    expect(html).toContain('<meta property="og:image" content="https://images.pexels.com/photos/1/a.jpeg">')
    expect(html).toContain('"@type":"Article"')
    expect(html).toContain('"datePublished":"2026-11-01T10:00:00Z"')
  })
  it('escapes everything a writer typed: no script, no raw angle brackets from the title', async () => {
    const page = renderPost(post, [], 'Helpnear', 'https://site.example')
    const html = await (await shellResponse(env, 'https://site.example', { ...page, path: '/blog/x' }, 'Helpnear')).text()
    expect(html).not.toMatch(/<script>alert/)
    expect(html).toContain('What Changes the Price of &lt;Lawn&gt; Mowing')
    expect(html).not.toContain('<Lawn>')
  })
  it('keeps the site security headers from the template and drops its noindex', async () => {
    const res = await shellResponse(env, 'https://site.example', { ...renderIndex([], 'Helpnear', undefined, 'https://site.example'), path: '/blog' }, 'Helpnear')
    expect(res.headers.get('content-security-policy')).toBe("default-src 'self'")
    expect(res.headers.get('x-robots-tag')).toBeNull()
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toContain('s-maxage=300')
  })
  it('answers 404 with noindex and no caching for a missing article', async () => {
    const res = await shellResponse(env, 'https://site.example', { title: 'Article not found', description: 'x', body: '<h1>Article not found</h1>', jsonld: {}, path: '/blog/nope', status: 404, robots: 'noindex' }, 'Helpnear')
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.text()).toContain('<meta name="robots" content="noindex">')
  })
  it('lists articles on the index and is honest when there are none', () => {
    expect(renderIndex([others[0]], 'Helpnear', undefined, 'https://site.example').body).toContain('href="/blog/other-one"')
    expect(renderIndex([], 'Helpnear', undefined, 'https://site.example').body).toContain('first guides are on their way')
  })

  const long = { ...post, category: 'lawn-care', updatedAt: '2026-11-05T10:00:00Z', videoUrl: '', body: '## One\n\nText about [lawn care](/services/lawn-care/).\n\n## Two\n\ntext\n\n## Three\n\ntext\n\n@calc\n\n| Job | Time |\n| --- | --- |\n| Mow | 1h |\n\n## Quick answers\n\n### Is it free?\n\nYes.\n\n### Who pays?\n\nYou pay the worker.' }
  it('adds a table of contents, a mid-article call to action, related and popular cities blocks, FAQ and breadcrumb data', async () => {
    const others2: PostCard[] = [{ slug: 'cost-guide', title: 'Cost guide', excerpt: '', imageUrl: '', imageAlt: '', publishedAt: '2026-10-02T00:00:00Z', category: 'cost-guides' }, { slug: 'mow-tips', title: 'Mow tips', excerpt: '', imageUrl: '', imageAlt: '', publishedAt: '2026-09-01T00:00:00Z', category: 'lawn-care' }]
    const page = renderPost(long, others2, 'Helpnear', 'https://site.example')
    const html = await (await shellResponse(env, 'https://site.example', { ...page, path: '/blog/lawn-mowing-cost' }, 'Helpnear')).text()
    expect(html).toContain('aria-label="Table of contents"')
    expect(html).toContain('href="#one"')
    expect(html).toContain('id="quick-answers"')
    expect(html.indexOf('class="cta-inline"')).toBeGreaterThan(html.indexOf('id="two"'))
    expect(html.indexOf('class="cta-inline"')).toBeLessThan(html.indexOf('id="three"'))
    expect(html).toContain('href="/services/lawn-care/">Lawn Care on Helpnear')
    expect(html).toContain('<h2>Related articles</h2>')
    expect(html.indexOf('href="/blog/mow-tips"')).toBeLessThan(html.indexOf('href="/blog/cost-guide"'))
    expect(html).toContain('<h2>Popular cities</h2>')
    expect(html).toContain('href="/locations/new-york-ny/"')
    expect(html).toContain('href="/blog/category/lawn-care">Lawn Care</a>')
    expect(html).toContain('Updated November 5, 2026')
    expect(html).toContain('data-hn-calc')
    expect(html).toContain('<script src="/blog-calc.js" defer></script>')
    expect(html).toContain('<div class="tbl">')
    expect(html).toContain('"@type":"FAQPage"')
    expect(html).toContain('"articleSection":"Lawn Care"')
    expect(html).toContain('"name":"Lawn Care","item":"https://site.example/blog/category/lawn-care"')
    expect(html.match(/<h1>/g)).toHaveLength(1)
  })
  it('does not load the calculator script or add FAQ data when the article has neither', async () => {
    const page = renderPost({ ...long, body: '## One\n\ntext\n\n## Two\n\ntext' }, [], 'Helpnear', 'https://site.example')
    const html = await (await shellResponse(env, 'https://site.example', { ...page, path: '/blog/x' }, 'Helpnear')).text()
    expect(html).not.toContain('blog-calc.js')
    expect(html).not.toContain('FAQPage')
    expect(html).not.toContain('aria-label="Table of contents"')
    expect(html).not.toContain('class="cta-inline"')
  })
  it('filters the blog by category with crawlable links and marks the active one', () => {
    const posts: PostCard[] = [{ ...others[0], category: 'cost-guides' }, { ...others[0], slug: 'lawn-1', title: 'Lawn one', category: 'lawn-care' }]
    const html = renderIndex(posts, 'Helpnear', 'lawn-care', 'https://site.example').body
    expect(html).toContain('href="/blog/lawn-1"')
    expect(html).not.toContain('href="/blog/other-one"')
    expect(html).toContain('<a href="/blog/category/lawn-care" aria-current="page">Lawn Care</a>')
    expect(html).toContain('<h1>Lawn Care guides</h1>')
    expect(html).toContain('href="/blog/category/cost-guides"')
    expect(html).not.toContain('href="/blog/category/painting"')
    expect(renderIndex(posts, 'Helpnear', 'lawn-care', 'https://site.example').title).toBe('Lawn Care guides and tips | Helpnear Blog')
  })
})
