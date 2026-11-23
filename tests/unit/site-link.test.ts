import { describe, it, expect } from 'vitest'
import { fillSiteTokens } from '../../src/shared/articles'
import { renderPost, type Post } from '../../functions/_lib/blog'

const body = '## Start here\n\nSome words about mowing. Try [{{SITE_NAME}}]({{SITE_URL}}/) or visit {{SITE_DOMAIN}} any time.\n\nSee [lawn care](/services/lawn-care/).'
const post: Post = { slug: 'mowing-tips', title: 'Mowing tips', excerpt: 'e', imageUrl: '', imageAlt: '', publishedAt: '2026-11-22T10:00:00Z', category: 'lawn-care', description: 'd', seoTitle: '', body, imageCredit: '', imageCreditUrl: '', videoUrl: '', updatedAt: '', keyword: 'mowing' }

describe('fillSiteTokens', () => {
  it('fills the three tokens and turns a link to the site itself into an internal link', () => {
    const out = fillSiteTokens(body, 'https://helpnear.pages.dev/', 'Helpnear')
    expect(out).toContain('[Helpnear](/)')
    expect(out).toContain('visit helpnear.pages.dev any time')
    expect(out).not.toContain('{{')
    expect(out).not.toContain('https://helpnear.pages.dev/)')
  })
  it('accepts spaces inside the braces and leaves other text alone', () => {
    expect(fillSiteTokens('a {{ SITE_URL }} b', 'https://x.test', 'X')).toBe('a https://x.test b')
    expect(fillSiteTokens('[docs](https://other.example/)', 'https://x.test', 'X')).toBe('[docs](https://other.example/)')
  })
})

describe('the article page follows the domain it is served on', () => {
  const html = (origin: string) => renderPost(post, [], 'Helpnear', origin).body
  it('shows the site link in the text and at the end, with no leftover tokens', () => {
    const h = html('https://helpnear.pages.dev')
    expect(h).toContain('<a href="/">Helpnear</a>')
    expect(h).toContain('helpnear.pages.dev')
    expect(h).toContain('class="site-link"')
    expect(h).toContain('<a href="https://helpnear.pages.dev/">helpnear.pages.dev</a>')
    expect(h).not.toContain('{{')
    expect(h).not.toContain('rel="noopener nofollow ugc"')
  })
  it('a new domain shows up in the same article without changing the article', () => {
    const h = html('https://www.newname.com')
    expect(h).toContain('<a href="https://www.newname.com/">www.newname.com</a>')
    expect(h).toContain('visit www.newname.com any time')
    expect(h).not.toContain('helpnear.pages.dev')
  })
})
