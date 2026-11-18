import { describe, expect, it } from 'vitest'
import { renderIndex, renderPost, shellResponse, type Post, type PostCard } from '../../functions/_lib/blog'

const tpl = '<html><head><title>%%TITLE%%</title><meta name="description" content="%%DESC%%"><meta name="robots" content="index,follow"><meta property="og:image" content="https://site.example/img/handy.jpg"><link rel="canonical" href="https://site.example%%PATH%%"><script type="application/ld+json">"%%JSONLD%%"</script></head><body><main>%%BODY%%</main></body></html>'
const env = { ASSETS: { fetch: async () => new Response(tpl, { headers: { 'content-security-policy': "default-src 'self'", 'x-robots-tag': 'noindex', 'content-type': 'application/octet-stream' } }) } }
const post: Post = { slug: 'lawn-mowing-cost', title: 'What Changes the Price of <Lawn> Mowing', excerpt: 'e', imageUrl: 'https://images.pexels.com/photos/1/a.jpeg', imageAlt: 'a "lawn"', publishedAt: '2026-11-01T10:00:00Z', description: 'd', seoTitle: 'Lawn mowing cost $5', body: '## Hello\n\nText with [lawn care](/services/lawn-care/).\n\n<script>alert(1)</script>', imageCredit: 'Photo by A on Pexels', imageCreditUrl: 'https://www.pexels.com/photo/1', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', updatedAt: '2026-11-02T10:00:00Z', keyword: 'lawn mowing cost' }
const others: PostCard[] = [{ slug: 'other-one', title: 'Other one', excerpt: '', imageUrl: '', imageAlt: '', publishedAt: '2026-10-01T00:00:00Z' }, { slug: 'lawn-mowing-cost', title: 'Same', excerpt: '', imageUrl: '', imageAlt: '', publishedAt: '' }]

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
    const res = await shellResponse(env, 'https://site.example', { ...renderIndex([], 'Helpnear'), path: '/blog' }, 'Helpnear')
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
    expect(renderIndex([others[0]], 'Helpnear').body).toContain('href="/blog/other-one"')
    expect(renderIndex([], 'Helpnear').body).toContain('first guides are on their way')
  })
})
