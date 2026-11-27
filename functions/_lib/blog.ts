// Public blog pages, rendered at the edge from Firestore (published articles only) so search engines get finished HTML and a new article
// is live within minutes of publishing, with no rebuild. The page frame (head, menu, footer, styles) is the same template the static pages use.
import { BLOG_CATEGORIES, categoryOf, escapeHtml, extractFaq, extractToc, fillSiteTokens, renderMarkdown, videoEmbed, wordCount, youtubeId } from '../../src/shared/articles'
import CITIES from '../../src/shared/cities.json'

export interface PagesEnv { ASSETS: { fetch(req: Request): Promise<Response> }; FIREBASE_PROJECT_ID?: string }
export interface PostCard { slug: string; title: string; excerpt: string; imageUrl: string; imageAlt: string; publishedAt: string; category: string }
export interface Post extends PostCard { description: string; seoTitle: string; body: string; imageCredit: string; imageCreditUrl: string; videoUrl: string; updatedAt: string; keyword: string }

const DEFAULT_PROJECT = 'helpnear-48ff5'
type Fv = Record<string, { stringValue?: string; timestampValue?: string }> | undefined
const s = (f: Fv, k: string) => f?.[k]?.stringValue ?? ''
const t = (f: Fv, k: string) => f?.[k]?.timestampValue ?? ''
const base = (env: PagesEnv) => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT}/databases/(default)/documents`

async function query(env: PagesEnv, filters: object[], limit: number): Promise<Fv[]> {
  const res = await fetch(`${base(env)}:runQuery`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'articles' }], where: { compositeFilter: { op: 'AND', filters: filters.map((f) => ({ fieldFilter: f })) } }, limit } }),
  })
  if (!res.ok) throw new Error(`firestore ${res.status}`)
  return ((await res.json()) as { document?: { fields?: Fv } }[]).flatMap((r) => (r.document?.fields ? [r.document.fields] : []))
}
const published = { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'published' } }
const card = (f: Fv): PostCard => ({ slug: s(f, 'slug'), title: s(f, 'title'), excerpt: s(f, 'excerpt'), imageUrl: s(f, 'imageUrl'), imageAlt: s(f, 'imageAlt'), publishedAt: t(f, 'publishedAt') || t(f, 'createdAt'), category: s(f, 'category') })
export async function listPosts(env: PagesEnv, limit = 100): Promise<PostCard[]> {
  return (await query(env, [published], limit)).map(card).filter((p) => p.slug).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}
export async function getPost(env: PagesEnv, slug: string): Promise<Post | null> {
  const [f] = await query(env, [published, { field: { fieldPath: 'slug' }, op: 'EQUAL', value: { stringValue: slug } }], 1)
  if (!f) return null
  return { ...card(f), description: s(f, 'description'), seoTitle: s(f, 'seoTitle'), body: s(f, 'body'), imageCredit: s(f, 'imageCredit'), imageCreditUrl: s(f, 'imageCreditUrl'), videoUrl: s(f, 'videoUrl'), updatedAt: t(f, 'updatedAt'), keyword: s(f, 'keyword') }
}

const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '')
const imgTag = (p: { imageUrl: string; imageAlt: string }, cls = '') => (p.imageUrl.startsWith('https://images.pexels.com/') || p.imageUrl.startsWith('/') ? `<img class="${cls}" src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.imageAlt)}" loading="lazy" width="800" height="533">` : '')

const POPULAR_CITIES = CITIES.slice(0, 8)
const cityList = () => `<ul class="cities">${POPULAR_CITIES.map((c) => `<li><a href="/locations/${c.slug}/">${escapeHtml(c.name)}, ${c.state}</a></li>`).join('')}</ul>`
const serviceName = (id: string) => id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
const catLink = (id: string) => { const c = categoryOf(id); return c ? `<a href="/blog/category/${c.id}">${escapeHtml(c.name)}</a>` : '' }
export function renderIndex(posts: PostCard[], brand: string, category: string | undefined, origin: string): { title: string; description: string; body: string; jsonld: unknown } {
  const cat = categoryOf(category)
  const shown = cat ? posts.filter((p) => p.category === cat.id) : posts
  const counts = new Map<string, number>()
  posts.forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1))
  const chips = `<nav class="chips" aria-label="Filter articles by category"><a href="/blog"${cat ? '' : ' aria-current="page"'}>All</a>${BLOG_CATEGORIES.filter((c) => counts.get(c.id) || c.id === cat?.id).map((c) => `<a href="/blog/category/${c.id}"${c.id === cat?.id ? ' aria-current="page"' : ''}>${escapeHtml(c.name)}</a>`).join('')}</nav>`
  const items = shown.map((p) => `<article class="pc"><a href="/blog/${escapeHtml(p.slug)}">${imgTag(p, 'pc-i')}<h2>${escapeHtml(p.title)}</h2></a><p>${escapeHtml(p.excerpt)}</p><p class="meta">${categoryOf(p.category)?.name ? `${escapeHtml(categoryOf(p.category)!.name)} · ` : ''}${fmtDate(p.publishedAt)}</p></article>`).join('\n')
  const heading = cat ? `${cat.name} guides` : `The ${brand} blog`
  const path = cat ? `/blog/category/${cat.id}` : '/blog'
  return {
    title: cat ? `${cat.name} guides and tips | ${brand} Blog` : `Home service guides and tips | ${brand} Blog`,
    description: cat
      ? `Plain-English ${cat.name.toLowerCase()} guides from ${brand}: what the job involves, what changes the price and how to get it done well.`
      : `Plain-English guides for clients and local workers: what a job involves, what changes the price, and how to get it done well. From ${brand}.`,
    body: `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / ${cat ? `<a href="/blog">Blog</a> / ${escapeHtml(cat.name)}` : 'Blog'}</nav><h1>${escapeHtml(heading)}</h1><p>Straight answers about home and yard jobs, for the clients who need them done and the workers who do them.</p>${chips}<div class="pcs">${items || '<p>The first guides are on their way.</p>'}</div><section><h2>Popular cities</h2>${cityList()}</section><p><a class="cta" href="/signup?role=worker">Join as a worker</a> <a class="cta y" href="/signup">Post a job</a></p>`,
    jsonld: { '@context': 'https://schema.org', '@graph': [
      { '@type': 'CollectionPage', name: heading, url: `${origin}${path}` },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` }, { '@type': 'ListItem', position: 2, name: 'Blog', item: `${origin}/blog` }, ...(cat ? [{ '@type': 'ListItem', position: 3, name: cat.name, item: `${origin}${path}` }] : [])] },
    ] },
  }
}
/** Related articles: the same category first, then the newest of the rest. */
function relatedPosts(p: Post, others: PostCard[]): PostCard[] {
  const rest = others.filter((o) => o.slug !== p.slug)
  const same = p.category ? rest.filter((o) => o.category === p.category) : []
  return [...same, ...rest.filter((o) => !same.includes(o))].slice(0, 3)
}
/** The service page the article's calls to action point to: the first service it already links to, else the category's own, else the hub. */
function ctaService(p: Post): string {
  const first = /\]\(\/services\/([a-z0-9-]+)\/?\)/.exec(p.body)?.[1]
  return first ?? categoryOf(p.category)?.service ?? ''
}
export function renderPost(p: Post, others: PostCard[], brand: string, origin: string): { title: string; description: string; body: string; jsonld: unknown; ogImage: string } {
  const url = `${origin}/blog/${p.slug}`
  const cat = categoryOf(p.category)
  const svc = ctaService(p)
  const svcHref = svc ? `/services/${svc}/` : '/services/'
  const svcLabel = svc ? `${serviceName(svc)} on ${brand}` : `All services on ${brand}`
  const video = youtubeId(p.videoUrl) ? videoEmbed(youtubeId(p.videoUrl)!) : ''
  const minutes = Math.max(1, Math.round(wordCount(p.body) / 220))
  const related = relatedPosts(p, others).map((o) => `<li><a href="/blog/${escapeHtml(o.slug)}">${escapeHtml(o.title)}</a></li>`).join('')
  const credit = p.imageCredit ? `<figcaption>${p.imageCreditUrl.startsWith('https://') ? `<a href="${escapeHtml(p.imageCreditUrl)}" rel="noopener nofollow" target="_blank">${escapeHtml(p.imageCredit)}</a>` : escapeHtml(p.imageCredit)}</figcaption>` : ''
  const hero = imgTag(p, 'hero')
  const toc = extractToc(p.body)
  const tocHtml = toc.length >= 3 ? `<nav class="toc" aria-label="Table of contents"><p class="toc-t">In this article</p><ol>${toc.map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join('')}</ol></nav>` : ''
  const midCta = `<aside class="cta-inline" aria-label="Get help"><p><strong>Want someone to handle this?</strong> Post your job free and local workers send you prices. See <a href="${svcHref}">${escapeHtml(svcLabel)}</a>.</p><a class="cta sm y" href="/signup">Post a job</a></aside>`
  let host = origin
  try { host = new URL(origin).host } catch { /* keep the raw value */ }
  let html = renderMarkdown(fillSiteTokens(p.body, origin, brand))
  const h2s = [...html.matchAll(/<h2[ >]/g)]
  if (h2s.length >= 3) { const at = h2s[2].index!; html = `${html.slice(0, at)}${midCta}\n${html.slice(at)}` }
  const published = p.publishedAt.slice(0, 10), updated = (p.updatedAt || '').slice(0, 10)
  const showUpdated = updated && updated > published
  const faq = extractFaq(p.body)
  const crumbItems = [['Home', `${origin}/`], ['Blog', `${origin}/blog`], ...(cat ? [[cat.name, `${origin}/blog/category/${cat.id}`]] : []), [p.title, url]]
  return {
    title: p.seoTitle || p.title,
    description: p.description || p.excerpt,
    ogImage: p.imageUrl.startsWith('https://') ? p.imageUrl : '',
    body: `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/blog">Blog</a>${cat ? ` / ${catLink(cat.id)}` : ''}</nav><article class="post"><h1>${escapeHtml(p.title)}</h1><p class="meta">${cat ? `${catLink(cat.id)} · ` : ''}Published ${fmtDate(p.publishedAt)}${showUpdated ? ` · Updated ${fmtDate(p.updatedAt)}` : ''} · ${minutes} min read</p>${hero ? `<figure>${hero}${credit}</figure>` : ''}${video}${tocHtml}${html}<aside class="cta-box"><h2>Ready to get it done?</h2><p>Post your home job for free and local workers near you send a price, with no platform fee and direct payment to the worker. Or join as a worker and find home service jobs near you.</p><p><a class="cta y" href="/signup?role=worker">Join as a worker</a> <a class="cta" href="/signup">Post a job</a> <a class="cta" href="${svcHref}">${escapeHtml(svcLabel)}</a></p><p class="site-link">${escapeHtml(brand)}: <a href="${escapeHtml(origin)}/">${escapeHtml(host)}</a></p></aside></article>${related ? `<section><h2>Related articles</h2><ul>${related}</ul></section>` : ''}<section><h2>Popular cities</h2><p>See what homes in these cities need through the year.</p>${cityList()}</section>${/^@calc$/m.test(p.body) ? '<script src="/blog-calc.js" defer></script>' : ''}`,
    jsonld: {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Article', headline: p.title, description: p.description || p.excerpt, image: p.imageUrl ? [p.imageUrl] : undefined, datePublished: p.publishedAt, dateModified: p.updatedAt || p.publishedAt, mainEntityOfPage: url, articleSection: cat?.name, inLanguage: 'en-US', wordCount: wordCount(p.body), author: { '@type': 'Organization', name: brand, url: origin }, publisher: { '@type': 'Organization', name: brand, url: origin } },
        { '@type': 'BreadcrumbList', itemListElement: crumbItems.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) },
        ...(faq.length ? [{ '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : []),
      ],
    },
  }
}

const KEEP = ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy']
/** Fills the static page template (written by the build) and returns it with the site's security headers. */
export async function shellResponse(env: PagesEnv, origin: string, page: { title: string; description: string; body: string; jsonld: unknown; path: string; ogImage?: string; status?: number; robots?: string }, brand: string): Promise<Response> {
  const shell = await env.ASSETS.fetch(new Request(`${origin}/_blog-shell.tpl`))
  if (!shell.ok) return new Response('Blog template missing: run a full build.', { status: 500 })
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': page.status && page.status !== 200 ? 'no-store' : 'public, max-age=300, s-maxage=300' })
  KEEP.forEach((k) => { const v = shell.headers.get(k); if (v) headers.set(k, v) })
  let html = (await shell.text())
    .replace('"%%JSONLD%%"', () => JSON.stringify(page.jsonld).replace(/</g, '\\u003c'))
    .replace(/%%TITLE%%/g, () => escapeHtml(page.title))
    .replace(/%%DESC%%/g, () => escapeHtml(page.description))
    .replace(/%%PATH%%/g, () => page.path)
    .replace('%%BODY%%', () => page.body)
  if (page.ogImage) html = html.replace(/(<meta property="og:image" content=")[^"]*(")/, (_m, a: string, b: string) => `${a}${escapeHtml(page.ogImage!)}${b}`)
  if (page.robots) html = html.replace(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${page.robots}">`)
  void brand
  return new Response(html, { status: page.status ?? 200, headers })
}
