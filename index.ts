// Helpnear edge worker. Two jobs:
//  POST /appcheck  : verify a Cloudflare Turnstile token, then mint a Firebase App Check token (custom provider).
//  POST /push      : after a worker claims a request, send a web-push to the request owner (FCM HTTP v1).
// Secrets: FIREBASE_SA_JSON, TURNSTILE_SECRET. See worker/README.md.
import { signJwt } from './jwt'
import { docsUrl, fsFetch, fsString, getAccessToken, parseServiceAccount, verifyIdToken, type Env, type FsFields, type ServiceAccount } from './google'

const APPCHECK_AUDIENCE = 'https://firebaseappcheck.googleapis.com/google.firebase.appcheck.v1.TokenExchangeService'
const REQUEST_ID = /^[A-Za-z0-9]{10,40}$/

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

async function handlePush(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401, cors)
  let user
  try { user = await verifyIdToken(auth.slice(7), env.FIREBASE_PROJECT_ID) } catch { return json({ error: 'unauthorized' }, 401, cors) }
  if (!user.emailVerified) return json({ error: 'email not verified' }, 403, cors)

  const { requestId } = (await req.json().catch(() => ({}))) as { requestId?: string }
  if (!requestId || !REQUEST_ID.test(requestId)) return json({ error: 'bad request id' }, 400, cors)

  const sa = parseServiceAccount(env)
  const base = docsUrl(env.FIREBASE_PROJECT_ID)
  // The caller must really have claimed this request (checked with the service account, not trusted from the client).
  const claim = await fsFetch(sa, `${base}/requests/${requestId}/claims/${user.uid}`)
  if (claim.status === 404) return json({ error: 'no claim' }, 403, cors)
  if (!claim.ok) return json({ error: 'upstream error' }, 502, cors)

  // One push per claim: atomic create, 409 when it already exists.
  const log = await fsFetch(sa, `${base}/pushLog?documentId=${requestId}_${user.uid}`, { method: 'POST', body: JSON.stringify({ fields: {} }) })
  if (log.status === 409) return json({ sent: 0, reason: 'already sent' }, 200, cors)
  if (!log.ok) return json({ error: 'upstream error' }, 502, cors)

  const reqDoc = await fsFetch(sa, `${base}/requests/${requestId}`)
  if (!reqDoc.ok) return json({ error: 'upstream error' }, 502, cors)
  const fields = ((await reqDoc.json()) as { fields?: FsFields }).fields
  const clientId = fsString(fields, 'clientId')
  const title = fsString(fields, 'title').slice(0, 60)
  if (!clientId) return json({ error: 'request not found' }, 404, cors)

  const tokensRes = await fsFetch(sa, `${base}/users/${clientId}/tokens?pageSize=20`)
  if (!tokensRes.ok) return json({ error: 'upstream error' }, 502, cors)
  const docs = ((await tokensRes.json()) as { documents?: { name: string; fields?: FsFields }[] }).documents ?? []

  let sent = 0
  for (const d of docs) {
    const token = fsString(d.fields, 'token')
    if (!token) continue
    const res = await fsFetch(sa, `https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
      method: 'POST',
      body: JSON.stringify({ message: { token, notification: { title: 'A worker claimed your request', body: title }, webpush: { fcm_options: { link: `${env.SITE_URL}/my-requests` } } } }),
    })
    if (res.ok) sent++
    else if (res.status === 404 || res.status === 400) await fsFetch(sa, `https://firestore.googleapis.com/v1/${d.name}`, { method: 'DELETE' }) // stale token
  }
  return json({ sent }, 200, cors)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req.headers.get('origin'), env)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, cors)
    const path = new URL(req.url).pathname
    try {
      if (path === '/appcheck') return await handleAppCheck(req, env, cors)
      if (path === '/push') return await handlePush(req, env, cors)
      return json({ error: 'not found' }, 404, cors)
    } catch (e) {
      console.error('worker error', e instanceof Error ? e.message : e)
      return json({ error: 'internal error' }, 500, cors)
    }
  },
}

