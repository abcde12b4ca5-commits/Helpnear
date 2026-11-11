// Helpnear edge worker. Two jobs:
//  POST /appcheck  : verify a Cloudflare Turnstile token, then mint a Firebase App Check token (custom provider).
//  POST /push      : after a claim changes (accepted, agreed, done, confirmed, reopened, cancelled), push the other side (FCM HTTP v1).
//  POST /push-new  : after a client posts a request, push the workers whose service and area match it.
// Secrets: FIREBASE_SA_JSON, TURNSTILE_SECRET. See worker/README.md.
import { signJwt } from './jwt'
import { runPolicy } from './policy'
import { docsUrl, fsBool, fsFetch, fsString, getAccessToken, parseServiceAccount, verifyIdToken, type Env, type FsFields, type ServiceAccount } from './google'

const APPCHECK_AUDIENCE = 'https://firebaseappcheck.googleapis.com/google.firebase.appcheck.v1.TokenExchangeService'
const REQUEST_ID = /^[A-Za-z0-9-]{10,60}$/

export function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  const h: Record<string, string> = { vary: 'origin' }
  if (origin && allowed.includes(origin)) {
    h['access-control-allow-origin'] = origin
    h['access-control-allow-methods'] = 'POST, OPTIONS'
    h['access-control-allow-headers'] = 'content-type, authorization'
    h['access-control-max-age'] = '86400'
  }
  return h
}

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } })

async function verifyTurnstile(token: string, secret: string, ip: string | null): Promise<boolean> {
  const form = new URLSearchParams({ secret, response: token })
  if (ip) form.set('remoteip', ip)
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  if (!res.ok) return false
  return ((await res.json()) as { success?: boolean }).success === true
}

/** Mints an App Check token for the web app using a custom token signed by the service account. */
export async function mintAppCheckToken(env: Env, sa: ServiceAccount): Promise<{ token: string; expireTimeMillis: number }> {
  const now = Math.floor(Date.now() / 1000)
  const customToken = await signJwt(
    { iss: sa.client_email, sub: sa.client_email, aud: APPCHECK_AUDIENCE, app_id: env.FIREBASE_APP_ID, iat: now, exp: now + 300 },
    sa.private_key,
  )
  const res = await fetch(`https://firebaseappcheck.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/apps/${env.FIREBASE_APP_ID}:exchangeCustomToken`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await getAccessToken(sa)}` },
    body: JSON.stringify({ customToken }),
  })
  if (!res.ok) throw new Error(`exchangeCustomToken HTTP ${res.status}`)
  const out = (await res.json()) as { token: string; ttl?: string }
  const ttl = Number.parseInt(out.ttl ?? '3600', 10) || 3600
  return { token: out.token, expireTimeMillis: Date.now() + ttl * 1000 }
}

async function handleAppCheck(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const { turnstileToken } = (await req.json().catch(() => ({}))) as { turnstileToken?: string }
  if (!turnstileToken || typeof turnstileToken !== 'string' || turnstileToken.length > 2048) return json({ error: 'missing token' }, 400, cors)
  if (!(await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET, req.headers.get('CF-Connecting-IP')))) return json({ error: 'verification failed' }, 403, cors)
  return json(await mintAppCheckToken(env, parseServiceAccount(env)), 200, cors)
}

type PushEvent = 'accepted' | 'agreed' | 'done' | 'confirmed' | 'reopened' | 'cancelled_by_worker' | 'cancelled_by_client'
/** caller: who may trigger it. status: the claim status that must really be stored ('' = no check). */
const EVENTS: Record<PushEvent, { caller: 'worker' | 'client'; status: string; title: string }> = {
  accepted: { caller: 'worker', status: '', title: 'A worker accepted your request' },
  done: { caller: 'worker', status: 'done', title: 'A worker marked your service as done. Please confirm.' },
  cancelled_by_worker: { caller: 'worker', status: 'cancelled', title: 'A worker cancelled' },
  agreed: { caller: 'client', status: '', title: 'The client agreed to your price' },
  confirmed: { caller: 'client', status: 'confirmed', title: 'The client confirmed your service' },
  reopened: { caller: 'client', status: '', title: 'The client says the work is not finished' },
  cancelled_by_client: { caller: 'client', status: 'cancelled', title: 'The client cancelled' },
}
const USER_ID = /^[A-Za-z0-9_-]{1,128}$/

/** Sends one notification to every stored device token of a user (max 2). Removes tokens FCM says are stale. */
async function pushToUser(sa: ServiceAccount, env: Env, userId: string, title: string, body: string, link: string, pageSize = 20): Promise<number> {
  const tokensRes = await fsFetch(sa, `${docsUrl(env.FIREBASE_PROJECT_ID)}/users/${userId}/tokens?pageSize=${pageSize}`)
  if (!tokensRes.ok) return 0
  const docs = ((await tokensRes.json()) as { documents?: { name: string; fields?: FsFields }[] }).documents ?? []
  let sent = 0
  for (const d of docs) {
    const token = fsString(d.fields, 'token')
    if (!token) continue
    const res = await fsFetch(sa, `https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
      method: 'POST',
      body: JSON.stringify({ message: { token, notification: { title, body }, webpush: { fcm_options: { link } } } }),
    })
    if (res.ok) sent++
    else if (res.status === 404 || res.status === 400) await fsFetch(sa, `https://firestore.googleapis.com/v1/${d.name}`, { method: 'DELETE' }) // stale token
  }
  return sent
}

async function handlePush(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401, cors)
  let user
  try { user = await verifyIdToken(auth.slice(7), env.FIREBASE_PROJECT_ID) } catch { return json({ error: 'unauthorized' }, 401, cors) }
  if (!user.emailVerified) return json({ error: 'email not verified' }, 403, cors)

  const b = (await req.json().catch(() => ({}))) as { requestId?: string; event?: string; workerId?: string }
  if (!b.requestId || !REQUEST_ID.test(b.requestId)) return json({ error: 'bad request id' }, 400, cors)
  const requestId = b.requestId
  const event = (b.event ?? 'accepted') as PushEvent
  const spec = EVENTS[event]
  if (!spec) return json({ error: 'bad event' }, 400, cors)
  const workerId = spec.caller === 'worker' ? user.uid : b.workerId
  if (!workerId || !USER_ID.test(workerId)) return json({ error: 'bad worker id' }, 400, cors)

  const sa = parseServiceAccount(env)
  const base = docsUrl(env.FIREBASE_PROJECT_ID)
  // The claim must really exist (checked with the service account, not trusted from the client).
  const claim = await fsFetch(sa, `${base}/requests/${requestId}/claims/${workerId}`)
  if (claim.status === 404) return json({ error: 'no claim' }, 403, cors)
  if (!claim.ok) return json({ error: 'upstream error' }, 502, cors)
  if (spec.status) {
    const status = fsString(((await claim.json()) as { fields?: FsFields }).fields, 'status')
    if (status !== spec.status) return json({ error: 'claim state does not match' }, 409, cors)
  }

  const reqDoc = await fsFetch(sa, `${base}/requests/${requestId}`)
  if (!reqDoc.ok) return json({ error: 'upstream error' }, 502, cors)
  const fields = ((await reqDoc.json()) as { fields?: FsFields }).fields
  const clientId = fsString(fields, 'clientId')
  const title = fsString(fields, 'title').slice(0, 60)
  if (!clientId) return json({ error: 'request not found' }, 404, cors)
  if (spec.caller === 'client' && clientId !== user.uid) return json({ error: 'not the request owner' }, 403, cors)

  // One push per claim and event (repeatable events get a one-hour bucket). Atomic create, 409 when it already exists.
  const logId = event === 'accepted' ? `${requestId}_${workerId}` : `${requestId}_${workerId}_${event}_${Math.floor(Date.now() / 3600_000)}`
  const log = await fsFetch(sa, `${base}/pushLog?documentId=${logId}`, { method: 'POST', body: JSON.stringify({ fields: {} }) })
  if (log.status === 409) return json({ sent: 0, reason: 'already sent' }, 200, cors)
  if (!log.ok) return json({ error: 'upstream error' }, 502, cors)

  const toClient = spec.caller === 'worker'
  const sent = await pushToUser(sa, env, toClient ? clientId : workerId, spec.title, title, `${env.SITE_URL}${toClient ? '/my-requests' : '/dashboard'}`)
  return json({ sent }, 200, cors)
}

/** After a client posts a request: push the (few) workers whose service + area match. Matching uses workers.matchKeys. */
async function handlePushNew(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401, cors)
  let user
  try { user = await verifyIdToken(auth.slice(7), env.FIREBASE_PROJECT_ID) } catch { return json({ error: 'unauthorized' }, 401, cors) }
  if (!user.emailVerified) return json({ error: 'email not verified' }, 403, cors)

  const { requestId } = (await req.json().catch(() => ({}))) as { requestId?: string }
  if (!requestId || !REQUEST_ID.test(requestId)) return json({ error: 'bad request id' }, 400, cors)

  const sa = parseServiceAccount(env)
  const base = docsUrl(env.FIREBASE_PROJECT_ID)
  const reqDoc = await fsFetch(sa, `${base}/requests/${requestId}`)
  if (!reqDoc.ok) return json({ error: 'upstream error' }, 502, cors)
  const fields = ((await reqDoc.json()) as { fields?: FsFields }).fields
  if (!fields || fsString(fields, 'clientId') !== user.uid) return json({ error: 'not the request owner' }, 403, cors)
  if (fsString(fields, 'status') !== 'open') return json({ sent: 0, reason: 'not open' }, 200, cors)
  const matchKey = fsString(fields, 'matchKey')
  if (!matchKey) return json({ error: 'request has no match key' }, 400, cors)

  // One fan-out per request: atomic create, 409 when it already exists.
  const log = await fsFetch(sa, `${base}/pushLog?documentId=new_${requestId}`, { method: 'POST', body: JSON.stringify({ fields: {} }) })
  if (log.status === 409) return json({ sent: 0, reason: 'already sent' }, 200, cors)
  if (!log.ok) return json({ error: 'upstream error' }, 502, cors)

  const max = Math.min(Math.max(Number.parseInt(env.MAX_NEW_PUSH ?? '10', 10) || 10, 1), 40)
  const q = await fsFetch(sa, `${base}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'workers' }], where: { fieldFilter: { field: { fieldPath: 'matchKeys' }, op: 'ARRAY_CONTAINS', value: { stringValue: matchKey } } }, limit: max } }),
  })
  if (!q.ok) return json({ error: 'upstream error' }, 502, cors)
  const rows = ((await q.json()) as { document?: { name: string; fields?: FsFields } }[]).filter((r) => r.document)
  const title = `${fsString(fields, 'categoryName')}: ${fsString(fields, 'title')}`.slice(0, 100)
  let sent = 0, workers = 0
  for (const r of rows) {
    const d = r.document!
    if (!fsBool(d.fields, 'isListed')) continue
    const workerId = d.name.split('/').pop() ?? ''
    if (!workerId || workerId === user.uid) continue
    workers++
    sent += await pushToUser(sa, env, workerId, 'New request near you', title, `${env.SITE_URL}/feed`, 2)
  }
  return json({ sent, workers }, 200, cors)
}

/** Admin-only: runs the fair-use rules now (the same code the schedule runs), so an admin can check it works. */
async function handleRunPolicy(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401, cors)
  let user
  try { user = await verifyIdToken(auth.slice(7), env.FIREBASE_PROJECT_ID) } catch { return json({ error: 'unauthorized' }, 401, cors) }
  const sa = parseServiceAccount(env)
  const admin = await fsFetch(sa, `${docsUrl(env.FIREBASE_PROJECT_ID)}/admins/${user.uid}`)
  if (!admin.ok) return json({ error: 'admins only' }, 403, cors)
  return json(await runPolicy(env), 200, cors)
}

export default {
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    ctx.waitUntil(runPolicy(env).then((r) => console.log('fair-use run', JSON.stringify(r))).catch((e) => console.error('fair-use run failed', e instanceof Error ? e.message : e)))
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req.headers.get('origin'), env)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, cors)
    const path = new URL(req.url).pathname
    try {
      if (path === '/appcheck') return await handleAppCheck(req, env, cors)
      if (path === '/push') return await handlePush(req, env, cors)
      if (path === '/push-new') return await handlePushNew(req, env, cors)
      if (path === '/run-policy') return await handleRunPolicy(req, env, cors)
      return json({ error: 'not found' }, 404, cors)
    } catch (e) {
      console.error('worker error', e instanceof Error ? e.message : e)
      return json({ error: 'internal error' }, 500, cors)
    }
  },
}

