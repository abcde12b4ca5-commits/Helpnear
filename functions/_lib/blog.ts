// Public blog pages, rendered at the edge from Firestore (published articles only) so search engines get finished HTML and a new article
// is live within minutes of publishing, with no rebuild. The page frame (head, menu, footer, styles) is the same template the static pages use.
import { escapeHtml, renderMarkdown, videoEmbed, wordCount, youtubeId } from '../../src/shared/articles'

export interface PagesEnv { ASSETS: { fetch(req: Request): Promise<Response> }; FIREBASE_PROJECT_ID?: string }
export interface PostCard { slug: string; title: string; excerpt: string; imageUrl: string; imageAlt: string; publishedAt: string }
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
const card = (f: Fv): PostCard => ({ slug: s(f, 'slug'), title: s(f, 'title'), excerpt: s(f, 'excerpt'), imageUrl: s(f, 'imageUrl'), imageAlt: s(f, 'imageAlt'), publishedAt: t(f, 'publishedAt') || t(f, 'createdAt') })
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

export function renderIndex(posts: PostCard[], brand: string): { title: string; description: string; body: string; jsonld: unknown } {
  const items = posts.map((p) => `<article class="pc"><a href="/blog/${escapeHtml(p.slug)}">${imgTag(p, 'pc-i')}<h2>${escapeHtml(p.title)}</h2></a><p>${escapeHtml(p.excerpt)}</p><p class="meta">${fmtDate(p.publishedAt)}</p></article>`).join('\n')
  return {
    title: `Home service guides and tips | ${brand} Blog`,
    description: `Plain-English guides for neighbors and local workers: what a job involves, what changes the price, and how to get it done well. From ${brand}.`,
    body: `<h1>The ${escapeHtml(brand)} blog</h1><p>Straight answers about home and yard jobs, for the neighbors who need them done and the workers who do them.</p><div class="pcs">${items || '<p>The first guides are on their way.</p>'}</div><p><a class="cta" href="/signup?role=worker">Join as a worker</a> <a class="cta y" href="/signup">Post a job</a></p>`,
    jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${brand} blog` },
  }
}
export function renderPost(p: Post, others: PostCard[], brand: string, origin: string): { title: string; description: string; body: string; jsonld: unknown; ogImage: string } {
  const url = `${origin}/blog/${p.slug}`
  const video = youtubeId(p.videoUrl) ? videoEmbed(youtubeId(p.videoUrl)!) : ''
  const minutes = Math.max(1, Math.round(wordCount(p.body) / 220))
  const more = others.filter((o) => o.slug !== p.slug).slice(0, 3).map((o) => `<li><a href="/blog/${escapeHtml(o.slug)}">${escapeHtml(o.title)}</a></li>`).join('')
  const credit = p.imageCredit ? `<figcaption>${p.imageCreditUrl.startsWith('https://') ? `<a href="${escapeHtml(p.imageCreditUrl)}" rel="noopener nofollow" target="_blank">${escapeHtml(p.imageCredit)}</a>` : escapeHtml(p.imageCredit)}</figcaption>` : ''
  const hero = imgTag(p, 'hero')
  return {
    title: p.seoTitle || p.title,
    description: p.description || p.excerpt,
    ogImage: p.imageUrl.startsWith('https://') ? p.imageUrl : '',
    body: `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/blog">Blog</a></nav><article class="post"><h1>${escapeHtml(p.title)}</h1><p class="meta">${fmtDate(p.publishedAt)} · ${minutes} min read</p>${hero ? `<figure>${hero}${credit}</figure>` : ''}${video}${renderMarkdown(p.body)}<aside class="cta-box"><h2>Ready to get it done?</h2><p>Post your job for free and local workers send you prices, or join as a worker and find jobs near you.</p><p><a class="cta y" href="/signup?role=worker">Join as a worker</a> <a class="cta" href="/signup">Post a job</a></p></aside></article>${more ? `<section><h2>Keep reading</h2><ul>${more}</ul></section>` : ''}`,
    jsonld: {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Article', headline: p.title, description: p.description || p.excerpt, image: p.imageUrl ? [p.imageUrl] : undefined, datePublished: p.publishedAt, dateModified: p.updatedAt || p.publishedAt, mainEntityOfPage: url, author: { '@type': 'Organization', name: brand, url: origin }, publisher: { '@type': 'Organization', name: brand, url: origin } },
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` }, { '@type': 'ListItem', position: 2, name: 'Blog', item: `${origin}/blog` }, { '@type': 'ListItem', position: 3, name: p.title, item: url }] },
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
