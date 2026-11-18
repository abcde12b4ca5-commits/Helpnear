// Everything about blog articles that has no browser or server dependency, shared by the admin page, the Worker (AI + schedule), the edge page
// renderer (functions/) and the tests: slugs, a SAFE markdown renderer, the AI prompts and parser, and the pre-publish quality checks.

export type ArticleStatus = 'draft' | 'published'
export interface ArticleFields {
  title: string; slug: string; keyword: string; seoTitle: string; description: string; excerpt: string
  body: string; imageUrl: string; imageAlt: string; imageCredit: string; imageCreditUrl: string; videoUrl: string
}

// ---------- slugs ----------
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'your', 'you', 'my', 'with', 'that', 'this', 'it', 'at', 'by', 'from'])
export function slugify(text: string, max = 60): string {
  const words = text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
  const keep = words.filter((w) => !STOP.has(w))
  const base = (keep.length >= 2 ? keep : words).join('-')
  return base.slice(0, max).replace(/-+$/g, '')
}
/** The link people see: built from the search phrase first, so the words people type are in the URL. */
export const makeSlug = (keyword: string, title: string): string => slugify(keyword.trim() || title)
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken)
  if (!set.has(base)) return base
  for (let i = 2; i < 500; i++) { const s = `${base.slice(0, 55)}-${i}`; if (!set.has(s)) return s }
  return `${base}-${Date.now()}`
}

// ---------- safe markdown -> HTML ----------
export const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
export function youtubeId(url: string): string | null {
  const m = /^https:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#].*)?$/.exec(url.trim())
  return m ? m[1] : null
}
export const videoEmbed = (id: string): string => `<div class="hn-video"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="Video" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
const IMAGE_HOSTS = ['images.pexels.com']
export function safeImageUrl(url: string): string | null {
  const u = url.trim()
  if (/^\/(?!\/)[\w./-]*$/.test(u)) return u
  try { const p = new URL(u); return p.protocol === 'https:' && IMAGE_HOSTS.includes(p.hostname) ? p.toString() : null } catch { return null }
}
function safeLinkUrl(url: string): string | null {
  const u = url.trim()
  if (/^\/(?!\/)[^\s"<>]*$/.test(u)) return u
  try { const p = new URL(u); return p.protocol === 'https:' ? p.toString() : null } catch { return null }
}
function inline(raw: string): string {
  let s = escapeHtml(raw)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => { const u = safeImageUrl(url.replace(/&amp;/g, '&')); return u ? `<img src="${escapeHtml(u)}" alt="${alt}" loading="lazy">` : '' })
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const u = safeLinkUrl(url.replace(/&amp;/g, '&'))
    if (!u) return text
    return u.startsWith('/') ? `<a href="${escapeHtml(u)}">${text}</a>` : `<a href="${escapeHtml(u)}" rel="noopener nofollow ugc" target="_blank">${text}</a>`
  })
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  return s
}
/** Renders the small markdown subset articles use. Everything is escaped first; only the tags produced here can appear. */
export function renderMarkdown(md: string): string {
  const out: string[] = []
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  let para: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = [] } }
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null } }
  for (const line of lines) {
    const t = line.trim()
    if (!t) { flushPara(); flushList(); continue }
    const h = /^(#{1,4})\s+(.+)$/.exec(t)
    if (h) { flushPara(); flushList(); const lvl = h[1].length <= 2 ? 2 : h[1].length === 3 ? 3 : 4; out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); continue }
    if (/^(-{3,}|\*{3,})$/.test(t)) { flushPara(); flushList(); out.push('<hr>'); continue }
    const v = /^@video\((\S+)\)$/.exec(t)
    if (v) { flushPara(); flushList(); const id = youtubeId(v[1]); if (id) out.push(videoEmbed(id)); continue }
    const q = /^>\s?(.*)$/.exec(t)
    if (q) { flushPara(); flushList(); out.push(`<blockquote><p>${inline(q[1])}</p></blockquote>`); continue }
    const li = /^[-*]\s+(.+)$/.exec(t) ?? null
    const ol = /^\d+[.)]\s+(.+)$/.exec(t) ?? null
    if (li || ol) {
      flushPara()
      const tag = li ? 'ul' : 'ol'
      if (list && list.tag !== tag) flushList()
      list ??= { tag, items: [] }
      list.items.push((li ?? ol)![1]); continue
    }
    flushList(); para.push(t)
  }
  flushPara(); flushList()
  return out.join('\n')
}
export const wordCount = (md: string): number => md.replace(/[#>*_`\-[\]()!]/g, ' ').split(/\s+/).filter(Boolean).length

// ---------- AI prompts and parsing ----------
export interface ServiceLink { id: string; name: string }
const BANNED = ['in today\'s fast-paced', 'in today\'s world', 'in the world of', 'delve', 'tapestry', 'landscape of', 'navigate the', 'ensure that', 'crucial', 'game-changer', 'game changer', 'unlock', 'elevate', 'seamless', 'in conclusion', 'it\'s important to note', 'it is important to note', 'look no further', 'whether you\'re a', 'dive into', 'a testament to', 'rest assured', 'peace of mind', 'stand the test of time']
export const bannedPhrasesIn = (text: string): string[] => { const l = text.toLowerCase(); return BANNED.filter((b) => l.includes(b)) }

const FACTS = 'Facts you may state about {site}: it is free to post a job; workers who cover that city see the request and send a price; up to 5 workers can answer; the neighbor chooses; the neighbor pays the worker directly; both leave a review after the job. Never say {site} checks, vets, insures or guarantees anyone.'

export function buildAnglesPrompt({ topic, count, existingTitles, site }: { topic: string; count: number; existingTitles: string[]; site: string }): { system: string; user: string } {
  return {
    system: `You plan blog articles for ${site}, a free U.S. marketplace where neighbors post home jobs and local workers send prices. You think like an SEO editor who knows what real people type into Google.`,
    user: `Topic: ${topic}\n\nPropose ${count} DIFFERENT articles on this topic. Each must answer a different question a person would search (a different search intent: what it costs and what changes the price, how to prepare, mistakes to avoid, how to choose, DIY vs hiring, seasonal timing, a checklist, etc). Never propose two titles that are the same idea reworded.\nEach title: natural, specific, under 62 characters, makes someone want to click, no clickbait, no year. Each keyword: the exact phrase a person would type, 2 to 5 words, lowercase.\n${existingTitles.length ? `Do not repeat or closely copy these existing titles:\n${existingTitles.slice(0, 80).map((t) => `- ${t}`).join('\n')}\n` : ''}\nAnswer with exactly ${count} lines and nothing else, each in this form:\nANGLE: <title> | <keyword> | <one short sentence on what the reader wants>`,
  }
}
export function parseAngles(text: string): { title: string; keyword: string; intent: string }[] {
  return text.split('\n').map((l) => /^\s*(?:\d+[.)]\s*)?ANGLE:\s*(.+)$/i.exec(l)?.[1]).filter((x): x is string => Boolean(x)).map((rest) => {
    const [title = '', keyword = '', intent = ''] = rest.split('|').map((p) => p.trim())
    return { title: title.replace(/^["“]|["”]$/g, ''), keyword: keyword.toLowerCase(), intent }
  }).filter((a) => a.title.length > 8 && a.keyword.length > 2)
}
export function buildArticlePrompt({ title, keyword, intent, services, site }: { title: string; keyword: string; intent: string; services: ServiceLink[]; site: string }): { system: string; user: string } {
  const links = services.slice(0, 40).map((s) => `/services/${s.id}/ (${s.name})`).join('; ')
  return {
    system: `You are a former tradesperson turned writer for ${site}. You write the way a neighbor explains things over the fence: plain, warm, specific, a little humor allowed. You have done this work and you have opinions.\n\nHARD RULES\n- American English. 1,100 to 1,500 words. Markdown only. Do not write an H1 (the title is added separately).\n- Open with 2 or 3 sentences that drop the reader into a real moment (a Saturday, a leaking hose, a landlord visit). No definitions, no "In today's world", no summaries of what the article will cover.\n- 5 to 7 H2 headings. Every heading must be built differently (a question, a command, a warning, a blunt statement, a short phrase). Never number the headings. Use H3 only when needed.\n- Short paragraphs of 1 to 4 sentences. Vary sentence length. Use one list or checklist where it truly helps, and include one short scenario with an imagined person (first name only).\n- The search phrase "${keyword}" must be in the first paragraph and in at least one H2. Use it and close variations 5 to 8 times in total, always in a natural sentence. Never repeat the exact phrase back to back, never stuff.\n- NEVER invent statistics, percentages, dollar amounts, prices, laws, studies, brand names, quotes or customer stories about ${site}. When talking about cost, explain what changes the price and say prices vary by area and job size. Do not give numbers you cannot know.\n- ${FACTS.replace(/\{site\}/g, site)}\n- Add 2 or 3 internal links with natural anchor text, using ONLY these paths: ${links}. Format: [anchor](/services/id/).\n- Do not use: ${BANNED.slice(0, 18).join(', ')}, or em dashes. No emojis.\n- After the main sections, add the H2 "Quick answers" with 3 or 4 questions as H3 and a 2-sentence answer each.\n- Finish with one short friendly paragraph that invites the reader to [post a job](/signup) or [join as a worker](/signup?role=worker). No hard sell.\n\nOUTPUT FORMAT (exactly, nothing before it):\nTITLE: <the article title>\nSEO_TITLE: <under 60 characters, starts with the search phrase if natural>\nMETA_DESCRIPTION: <140 to 155 characters, a promise, not a summary>\nKEYWORD: ${keyword}\nEXCERPT: <one sentence, under 160 characters>\nIMAGE_QUERY: <3 words for a stock photo search, no people's names>\n---\n<markdown body>`,
    user: `Write the article.\nTitle to use or improve slightly: ${title}\nSearch phrase: ${keyword}\nWhat the reader wants: ${intent || 'a clear, honest answer they can act on today'}`,
  }
}
export interface ParsedArticle { title: string; seoTitle: string; description: string; keyword: string; excerpt: string; imageQuery: string; body: string }
export function parseArticleOutput(text: string): ParsedArticle | null {
  const i = text.search(/^\s*---\s*$/m)
  if (i < 0) return null
  const head = text.slice(0, i), body = text.slice(i).replace(/^\s*---\s*/, '')
  const get = (k: string) => new RegExp(`^\\s*${k}:\\s*(.+)$`, 'mi').exec(head)?.[1].trim().replace(/^["“]|["”]$/g, '') ?? ''
  const title = get('TITLE')
  if (!title || body.trim().length < 300) return null
  return { title, seoTitle: get('SEO_TITLE'), description: get('META_DESCRIPTION'), keyword: get('KEYWORD').toLowerCase(), excerpt: get('EXCERPT'), imageQuery: get('IMAGE_QUERY'), body: cleanBody(body) }
}
/** Light clean-up of typical machine habits: em dashes, doubled blank lines, a leading H1 that repeats the title. */
export function cleanBody(body: string): string {
  return body.replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, '-').replace(/^#\s+.*\n+/, '').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

// ---------- quality checks shown before publishing ----------
const tokens = (s: string) => new Set(slugify(s, 200).split('-').filter(Boolean))
export function titleSimilarity(a: string, b: string): number {
  const x = tokens(a), y = tokens(b)
  if (!x.size || !y.size) return 0
  let common = 0
  x.forEach((t) => { if (y.has(t)) common++ })
  return common / (x.size + y.size - common)
}
export const findSimilar = (title: string, others: string[], threshold = 0.6): string[] => others.filter((o) => titleSimilarity(title, o) >= threshold)
export interface CheckItem { label: string; pass: boolean; detail?: string }
export function checkArticle(a: Pick<ArticleFields, 'title' | 'slug' | 'keyword' | 'seoTitle' | 'description' | 'body' | 'imageUrl'>, otherTitles: string[] = []): CheckItem[] {
  const kw = a.keyword.toLowerCase().trim()
  const words = wordCount(a.body)
  const firstPara = a.body.split(/\n\s*\n/).find((p) => p.trim() && !p.trim().startsWith('#')) ?? ''
  const h2 = (a.body.match(/^##\s+.+$/gm) ?? []).map((h) => h.replace(/^##\s+/, ''))
  const slugWords = slugify(kw).split('-').filter(Boolean)
  const banned = bannedPhrasesIn(a.body)
  const links = (a.body.match(/\]\(\/[^)]+\)/g) ?? []).length
  const dollars = a.body.match(/\$\s?\d[\d,.]*/g) ?? []
  const similar = findSimilar(a.title, otherTitles)
  return [
    { label: 'Length of 900 words or more', pass: words >= 900, detail: `${words} words` },
    { label: 'Search phrase is in the title', pass: Boolean(kw) && a.title.toLowerCase().includes(kw), detail: kw || 'no search phrase set' },
    { label: 'Search phrase is in the first paragraph', pass: Boolean(kw) && firstPara.toLowerCase().includes(kw) },
    { label: 'Search phrase is in at least one H2', pass: Boolean(kw) && h2.some((h) => h.toLowerCase().includes(kw)) },
    { label: 'Link (URL) contains the search phrase words', pass: slugWords.length > 0 && slugWords.every((w) => a.slug.split('-').includes(w)), detail: `/blog/${a.slug}` },
    { label: 'At least 5 different H2 headings', pass: new Set(h2.map((h) => h.toLowerCase())).size >= 5, detail: `${h2.length} headings` },
    { label: 'Title is 62 characters or fewer', pass: a.title.length <= 62, detail: `${a.title.length} characters` },
    { label: 'Meta description is 120 to 160 characters', pass: a.description.length >= 120 && a.description.length <= 160, detail: `${a.description.length} characters` },
    { label: 'Has 2 or more links to service pages', pass: links >= 2, detail: `${links} links` },
    { label: 'Has an image', pass: Boolean(a.imageUrl) },
    { label: 'No stock AI phrases', pass: banned.length === 0, detail: banned.join(', ') || undefined },
    { label: 'No dollar amounts (check any you keep is true)', pass: dollars.length === 0, detail: dollars.join(', ') || undefined },
    { label: 'Not too similar to another article', pass: similar.length === 0, detail: similar.join(' | ') || undefined },
  ]
}
