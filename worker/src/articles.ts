// Blog articles: AI drafting (Cloudflare Workers AI, no key needed), stock photo lookup (Pexels, optional key), publishing, and the daily schedule.
// Everything an admin triggers is checked against admins/{uid} first. The schedule only ever writes DRAFTS unless the admin chose "auto-publish".
import { docsUrl, fsFetch, fsNum, fsString, fsTime, parseServiceAccount, verifyIdToken, type Env, type FsFields } from './google'
import { buildAnglesPrompt, buildArticlePrompt, findSimilar, makeSlug, parseAngles, parseArticleOutput, uniqueSlug, wordCount, type ArticleFields, type ServiceLink } from '../../src/shared/articles'

export const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const DAY = 86_400_000
type Cors = Record<string, string>
const json = (body: unknown, status: number, cors: Cors) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } })
const siteName = (env: Env) => env.SITE_NAME || 'Helpnear'

// ---------- Firestore value encoding ----------
type V = string | number | boolean | Date | string[]
type FsValue = Record<string, unknown>
function enc(v: V): FsValue {
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  return { arrayValue: { values: v.map((s) => ({ stringValue: s })) } }
}
const encFields = (o: Record<string, V>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]))
const fsStrings = (f: FsFields | undefined, key: string): string[] => ((f?.[key] as { arrayValue?: { values?: { stringValue?: string }[] } } | undefined)?.arrayValue?.values ?? []).map((x) => x.stringValue ?? '').filter(Boolean)
const idOf = (name: string) => name.slice(name.lastIndexOf('/') + 1)

export interface ArticleSettings { mode: 'off' | 'draft' | 'publish'; everyDays: number; topics: string[]; lastRunAt: number; lastError: string }
export function readSettings(f: FsFields | undefined): ArticleSettings {
  const mode = fsString(f, 'mode')
  return { mode: mode === 'draft' || mode === 'publish' ? mode : 'off', everyDays: Math.min(30, Math.max(1, fsNum(f, 'everyDays', 1))), topics: fsStrings(f, 'topics'), lastRunAt: fsTime(f, 'lastRunAt'), lastError: fsString(f, 'lastError') }
}
/** Due when enough days have passed since the last run (a 15-minute margin, because the schedule ticks every 15 minutes). */
export const isDue = (s: ArticleSettings, now: number): boolean => s.mode !== 'off' && now - s.lastRunAt >= s.everyDays * DAY - 15 * 60_000

// ---------- AI ----------
async function runAI(env: Env, system: string, user: string, maxTokens: number): Promise<string> {
  if (!env.AI) throw new Error('Workers AI is not connected: add the [ai] binding to worker/wrangler.toml and redeploy the worker')
  const r = await env.AI.run(env.AI_MODEL || DEFAULT_MODEL, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: maxTokens, temperature: 0.85, top_p: 0.92 }) as unknown
  const text = typeof r === 'string' ? r : ((r as { response?: string; result?: { response?: string } })?.response ?? (r as { result?: { response?: string } })?.result?.response ?? '')
  if (!text.trim()) throw new Error('the AI returned nothing')
  return text
}

export interface Photo { imageUrl: string; imageAlt: string; imageCredit: string; imageCreditUrl: string }
/** Free stock photos from Pexels. Needs PEXELS_API_KEY; without it articles are created without an image and the admin adds one. */
export async function searchPhotos(env: Env, query: string, perPage = 6): Promise<Photo[]> {
  if (!env.PEXELS_API_KEY) return []
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`, { headers: { authorization: env.PEXELS_API_KEY } })
  if (!res.ok) return []
  const data = await res.json() as { photos?: { src?: { large2x?: string; large?: string }; alt?: string; photographer?: string; url?: string }[] }
  return (data.photos ?? []).flatMap((p) => {
    const url = p.src?.large2x ?? p.src?.large
    return url && url.startsWith('https://images.pexels.com/') ? [{ imageUrl: url, imageAlt: p.alt || query, imageCredit: `Photo by ${p.photographer ?? 'Pexels'} on Pexels`, imageCreditUrl: p.url ?? 'https://www.pexels.com' }] : []
  })
}

export interface Draft extends ArticleFields { imageQuery: string }
export interface Spec { title: string; keyword: string; intent: string }
export interface Context { services: ServiceLink[]; takenSlugs: string[]; otherTitles: string[] }
/** One article from one idea: prompt, AI call (one retry if the answer is malformed), unique link, stock photo. */
export async function composeArticle(env: Env, spec: Spec, ctx: Context): Promise<Draft> {
  const p = buildArticlePrompt({ ...spec, services: ctx.services, site: siteName(env) })
  let parsed = null
  for (let i = 0; i < 2 && !parsed; i++) parsed = parseArticleOutput(await runAI(env, p.system, p.user, 3600))
  if (!parsed) throw new Error('the AI answer was not in the expected format twice; try again')
  const keyword = parsed.keyword || spec.keyword
  const photo = (await searchPhotos(env, parsed.imageQuery || keyword, 1))[0]
  return {
    title: parsed.title, slug: uniqueSlug(makeSlug(keyword, parsed.title), ctx.takenSlugs), keyword, seoTitle: parsed.seoTitle || parsed.title, description: parsed.description, excerpt: parsed.excerpt,
    body: parsed.body, imageUrl: photo?.imageUrl ?? '', imageAlt: photo?.imageAlt ?? `${keyword}`, imageCredit: photo?.imageCredit ?? '', imageCreditUrl: photo?.imageCreditUrl ?? '', videoUrl: '', imageQuery: parsed.imageQuery,
  }
}

// ---------- Firestore reads/writes ----------
async function listDocs(env: Env, path: string, fields: string[]): Promise<{ id: string; fields: FsFields }[]> {
  const sa = parseServiceAccount(env)
  const res = await fsFetch(sa, `${docsUrl(env.FIREBASE_PROJECT_ID)}/${path}?pageSize=300&${fields.map((f) => `mask.fieldPaths=${f}`).join('&')}`)
  if (!res.ok) return []
  const data = await res.json() as { documents?: { name: string; fields?: FsFields }[] }
  return (data.documents ?? []).map((d) => ({ id: idOf(d.name), fields: d.fields ?? {} }))
}
export async function loadContext(env: Env): Promise<Context & { raw: { id: string; fields: FsFields }[] }> {
  const [arts, cats] = await Promise.all([listDocs(env, 'articles', ['title', 'slug']), listDocs(env, 'categories', ['name', 'enabled', 'riskLevel'])])
  const services = cats.filter((c) => (c.fields.enabled as { booleanValue?: boolean } | undefined)?.booleanValue === true && fsString(c.fields, 'riskLevel') === 'low').map((c) => ({ id: c.id, name: fsString(c.fields, 'name') }))
  return { services, takenSlugs: arts.map((a) => fsString(a.fields, 'slug')), otherTitles: arts.map((a) => fsString(a.fields, 'title')), raw: arts }
}
export async function saveDraft(env: Env, d: Draft, status: 'draft' | 'published', source: 'ai' | 'manual', now = Date.now()): Promise<string> {
  const sa = parseServiceAccount(env)
  const doc: Record<string, V> = { title: d.title, slug: d.slug, keyword: d.keyword, seoTitle: d.seoTitle, description: d.description, excerpt: d.excerpt, body: d.body, imageUrl: d.imageUrl, imageAlt: d.imageAlt, imageCredit: d.imageCredit, imageCreditUrl: d.imageCreditUrl, videoUrl: d.videoUrl, status, source, wordCount: wordCount(d.body), createdAt: new Date(now), updatedAt: new Date(now) }
  if (status === 'published') doc.publishedAt = new Date(now)
  const res = await fsFetch(sa, `${docsUrl(env.FIREBASE_PROJECT_ID)}/articles`, { method: 'POST', body: JSON.stringify({ fields: encFields(doc) }) })
  if (!res.ok) throw new Error(`could not save the article (${res.status})`)
  return idOf(((await res.json()) as { name: string }).name)
}
async function patchDoc(env: Env, path: string, values: Record<string, V>): Promise<void> {
  const sa = parseServiceAccount(env)
  const mask = Object.keys(values).map((k) => `updateMask.fieldPaths=${k}`).join('&')
  const res = await fsFetch(sa, `${docsUrl(env.FIREBASE_PROJECT_ID)}/${path}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields: encFields(values) }) })
  if (!res.ok) throw new Error(`could not update ${path} (${res.status})`)
}
async function pingIndexNow(env: Env, slug: string): Promise<void> {
  if (!env.INDEXNOW_KEY || !env.SITE_URL) return
  const url = `${env.SITE_URL}/blog/${slug}`
  await fetch(`https://api.indexnow.org/indexnow?url=${encodeURIComponent(url)}&key=${env.INDEXNOW_KEY}`).catch(() => undefined)
}
async function publishById(env: Env, id: string, publish: boolean, now = Date.now()): Promise<{ slug: string }> {
  const sa = parseServiceAccount(env)
  const res = await fsFetch(sa, `${docsUrl(env.FIREBASE_PROJECT_ID)}/articles/${id}`)
  if (!res.ok) throw new Error('article not found')
  const fields = ((await res.json()) as { fields?: FsFields }).fields
  const slug = fsString(fields, 'slug')
  await patchDoc(env, `articles/${id}`, publish ? { status: 'published', publishedAt: new Date(fsTime(fields, 'publishedAt') || now), updatedAt: new Date(now) } : { status: 'draft', updatedAt: new Date(now) })
  if (publish) await pingIndexNow(env, slug)
  return { slug }
}

// ---------- HTTP handlers (admin only) ----------
async function requireAdmin(req: Request, env: Env, cors: Cors): Promise<Response | null> {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401, cors)
  let uid: string
  try { uid = (await verifyIdToken(auth.slice(7), env.FIREBASE_PROJECT_ID)).uid } catch { return json({ error: 'unauthorized' }, 401, cors) }
  const admin = await fsFetch(parseServiceAccount(env), `${docsUrl(env.FIREBASE_PROJECT_ID)}/admins/${uid}`)
  return admin.ok ? null : json({ error: 'admins only' }, 403, cors)
}
const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '')
async function body(req: Request): Promise<Record<string, unknown>> { try { return (await req.json()) as Record<string, unknown> } catch { return {} } }
const fail = (e: unknown, cors: Cors) => json({ error: e instanceof Error ? e.message : 'failed' }, 500, cors)

export async function handleAngles(req: Request, env: Env, cors: Cors): Promise<Response> {
  const denied = await requireAdmin(req, env, cors); if (denied) return denied
  const b = await body(req)
  const topic = clip(b.topic, 160)
  const count = Math.min(5, Math.max(1, Number(b.count) || 3))
  if (topic.length < 3) return json({ error: 'topic is required' }, 400, cors)
  try {
    const ctx = await loadContext(env)
    const p = buildAnglesPrompt({ topic, count, existingTitles: ctx.otherTitles, site: siteName(env) })
    const angles = parseAngles(await runAI(env, p.system, p.user, 700)).slice(0, count)
    return json({ angles: angles.map((a) => ({ ...a, similarTo: findSimilar(a.title, ctx.otherTitles) })) }, 200, cors)
  } catch (e) { return fail(e, cors) }
}
export async function handleGenerate(req: Request, env: Env, cors: Cors): Promise<Response> {
  const denied = await requireAdmin(req, env, cors); if (denied) return denied
  const b = await body(req)
  const spec = { title: clip(b.title, 120), keyword: clip(b.keyword, 80).toLowerCase(), intent: clip(b.intent, 200) }
  if (spec.title.length < 8 || spec.keyword.length < 3) return json({ error: 'title and keyword are required' }, 400, cors)
  try {
    const ctx = await loadContext(env)
    const draft = await composeArticle(env, spec, ctx)
    const id = await saveDraft(env, draft, 'draft', 'ai')
    return json({ id, slug: draft.slug, title: draft.title }, 200, cors)
  } catch (e) { return fail(e, cors) }
}
export async function handlePublish(req: Request, env: Env, cors: Cors): Promise<Response> {
  const denied = await requireAdmin(req, env, cors); if (denied) return denied
  const b = await body(req)
  const id = clip(b.id, 40)
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return json({ error: 'bad id' }, 400, cors)
  try { return json(await publishById(env, id, b.publish !== false), 200, cors) } catch (e) { return fail(e, cors) }
}
export async function handleImages(req: Request, env: Env, cors: Cors): Promise<Response> {
  const denied = await requireAdmin(req, env, cors); if (denied) return denied
  const query = clip((await body(req)).query, 80)
  if (query.length < 2) return json({ error: 'query is required' }, 400, cors)
  if (!env.PEXELS_API_KEY) return json({ error: 'Add the PEXELS_API_KEY secret to the worker to search photos (free key from pexels.com/api).' }, 400, cors)
  return json({ photos: await searchPhotos(env, query, 9) }, 200, cors)
}

// ---------- the schedule ----------
export interface JobResult { ran: boolean; reason?: string; id?: string; published?: boolean }
export async function runArticleJob(env: Env, now = Date.now()): Promise<JobResult> {
  if (!env.AI) return { ran: false, reason: 'AI binding missing' }
  const sa = parseServiceAccount(env)
  const res = await fsFetch(sa, `${docsUrl(env.FIREBASE_PROJECT_ID)}/articleSettings/main`)
  if (!res.ok) return { ran: false, reason: 'no settings yet' }
  const settings = readSettings(((await res.json()) as { fields?: FsFields }).fields)
  if (!isDue(settings, now)) return { ran: false, reason: settings.mode === 'off' ? 'off' : 'not due' }
  await patchDoc(env, 'articleSettings/main', { lastRunAt: new Date(now) }) // claim the slot first, so overlapping runs cannot write two articles
  try {
    const ctx = await loadContext(env)
    let topic = settings.topics[0]
    if (!topic) {
      const names = ctx.services.map((s) => s.name)
      const t = await runAI(env, 'You are an SEO editor for a U.S. home-services marketplace.', `Suggest ONE new topic for a helpful blog post about home or yard work that a neighbor might need help with. Pick from or near: ${names.join(', ')}.\nIt must not overlap these existing titles:\n${ctx.otherTitles.slice(0, 80).map((x) => `- ${x}`).join('\n') || '(none yet)'}\nAnswer with the topic only, under 12 words.`, 60)
      topic = t.trim().split('\n')[0].replace(/^["'\-\s]+|["'\s]+$/g, '').slice(0, 160)
    }
    const ap = buildAnglesPrompt({ topic, count: 1, existingTitles: ctx.otherTitles, site: siteName(env) })
    const angle = parseAngles(await runAI(env, ap.system, ap.user, 400))[0]
    if (!angle) throw new Error('could not plan an article for the topic')
    const draft = await composeArticle(env, angle, ctx)
    const publish = settings.mode === 'publish' && findSimilar(draft.title, ctx.otherTitles, 0.7).length === 0
    const id = await saveDraft(env, draft, publish ? 'published' : 'draft', 'ai', now)
    if (publish) await pingIndexNow(env, draft.slug)
    await patchDoc(env, 'articleSettings/main', { lastError: '', ...(settings.topics.length ? { topics: settings.topics.slice(1) } : {}) })
    return { ran: true, id, published: publish }
  } catch (e) {
    // try again in about 2 hours instead of waiting a whole period
    await patchDoc(env, 'articleSettings/main', { lastRunAt: new Date(now - settings.everyDays * DAY + 2 * 3_600_000), lastError: (e instanceof Error ? e.message : 'failed').slice(0, 300) }).catch(() => undefined)
    return { ran: false, reason: e instanceof Error ? e.message : 'failed' }
  }
}
