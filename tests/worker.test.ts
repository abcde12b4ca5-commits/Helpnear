// Worker logic tests. Run with: npm run test:worker (no emulator needed).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { b64url, importJwk, signJwt, verifyJwt, type Jwk } from '../worker/src/jwt'
import { resetAccessTokenCache, verifyIdToken, type Env } from '../worker/src/google'
import worker, { corsHeaders } from '../worker/src/index'

let pem = ''
let publicJwk: Jwk
const toPem = (der: ArrayBuffer) => `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(der)))}\n-----END PRIVATE KEY-----`

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  pem = toPem(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' } as Jwk
})
afterEach(() => { vi.unstubAllGlobals(); resetAccessTokenCache() })

const getKey = async (kid: string) => (kid === 'k1' ? importJwk(publicJwk) : null)
const nowSec = () => Math.floor(Date.now() / 1000)
const idToken = (over: Record<string, unknown> = {}, kid = 'k1') =>
  signJwt({ iss: 'https://securetoken.google.com/proj', aud: 'proj', sub: 'user1', iat: nowSec(), exp: nowSec() + 3600, email_verified: true, ...over }, pem, { kid })

describe('jwt', () => {
  it('round-trips a signed token', async () => {
    const p = await verifyJwt(await idToken(), getKey)
    expect(p.sub).toBe('user1')
  })
  it('rejects tampered, expired, unknown-key and malformed tokens', async () => {
    const t = await idToken()
    const [h, , s] = t.split('.')
    await expect(verifyJwt(`${h}.${b64url(JSON.stringify({ sub: 'evil', exp: nowSec() + 99, iat: nowSec() }))}.${s}`, getKey)).rejects.toThrow()
    await expect(verifyJwt(await idToken({ exp: nowSec() - 10 }), getKey)).rejects.toThrow('expired')
    await expect(verifyJwt(await idToken({}, 'other'), getKey)).rejects.toThrow('unknown key')
    await expect(verifyJwt('abc', getKey)).rejects.toThrow('malformed')
  })
})

describe('verifyIdToken', () => {
  it('accepts a valid token and reads email_verified', async () => {
    expect(await verifyIdToken(await idToken(), 'proj', getKey)).toEqual({ uid: 'user1', emailVerified: true })
    expect((await verifyIdToken(await idToken({ email_verified: false }), 'proj', getKey)).emailVerified).toBe(false)
  })
  it('rejects wrong audience, issuer or missing subject', async () => {
    await expect(verifyIdToken(await idToken({ aud: 'other' }), 'proj', getKey)).rejects.toThrow()
    await expect(verifyIdToken(await idToken({ iss: 'https://evil.example' }), 'proj', getKey)).rejects.toThrow()
    await expect(verifyIdToken(await idToken({ sub: '' }), 'proj', getKey)).rejects.toThrow()
  })
})

const env = (): Env => ({
  FIREBASE_SA_JSON: JSON.stringify({ client_email: 'sa@proj.iam.gserviceaccount.com', private_key: pem }),
  TURNSTILE_SECRET: 'secret', FIREBASE_PROJECT_ID: 'proj', FIREBASE_APP_ID: '1:123:web:abc',
  ALLOWED_ORIGINS: 'https://site.example, http://localhost:5173', SITE_URL: 'https://site.example',
})
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://w.example${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://site.example', ...headers }, body: JSON.stringify(body) })

describe('cors', () => {
  it('allows listed origins only', () => {
    expect(corsHeaders('https://site.example', env())['access-control-allow-origin']).toBe('https://site.example')
    expect(corsHeaders('https://evil.example', env())['access-control-allow-origin']).toBeUndefined()
  })
  it('answers preflight and rejects non-POST', async () => {
    expect((await worker.fetch(new Request('https://w.example/push', { method: 'OPTIONS', headers: { origin: 'https://site.example' } }), env())).status).toBe(204)
    expect((await worker.fetch(new Request('https://w.example/push', { method: 'GET' }), env())).status).toBe(405)
  })
})

describe('POST /appcheck', () => {
  it('refuses when Turnstile verification fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: false })))
    expect((await worker.fetch(post('/appcheck', { turnstileToken: 'bad' }), env())).status).toBe(403)
  })
  it('mints an App Check token after Turnstile succeeds, with the expected claims', async () => {
    let customToken = ''
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('turnstile')) return Response.json({ success: true })
      if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'at', expires_in: 3600 })
      if (url.includes('exchangeCustomToken')) {
        expect(url).toContain('/projects/proj/apps/1:123:web:abc:exchangeCustomToken')
        customToken = (JSON.parse(String(init?.body)) as { customToken: string }).customToken
        return Response.json({ token: 'appcheck-token', ttl: '3600s' })
      }
      throw new Error(`unexpected fetch ${url}`)
    }))
    const res = await worker.fetch(post('/appcheck', { turnstileToken: 'ok' }), env())
    expect(res.status).toBe(200)
    expect(((await res.json()) as { token: string }).token).toBe('appcheck-token')
    const claims = JSON.parse(atob(customToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
    expect(claims.app_id).toBe('1:123:web:abc')
    expect(claims.aud).toBe('https://firebaseappcheck.googleapis.com/google.firebase.appcheck.v1.TokenExchangeService')
    expect(claims.iss).toBe('sa@proj.iam.gserviceaccount.com')
  })
  it('rejects a missing token', async () => {
    expect((await worker.fetch(post('/appcheck', {}), env())).status).toBe(400)
  })
})

describe('POST /push', () => {
  it('requires a bearer token', async () => {
    expect((await worker.fetch(post('/push', { requestId: 'abcdefghij1234567890' }), env())).status).toBe(401)
    expect((await worker.fetch(post('/push', { requestId: 'abcdefghij1234567890' }, { authorization: 'Bearer junk' }), env())).status).toBe(401)
  })
  const REQ = 'abcdefghij1234567890'
  const mockCloud = (opts: { claim?: number; log?: number } = {}) => {
    const sent: string[] = []
    const deleted: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') { deleted.push(url); return new Response('{}') }
      if (url.includes('securetoken@system')) return Response.json({ keys: [publicJwk] })
      if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'at', expires_in: 3600 })
      if (url.includes(`/requests/${REQ}/claims/user1`)) return new Response('{}', { status: opts.claim ?? 200 })
      if (url.includes('/pushLog?')) return new Response('{}', { status: opts.log ?? 200 })
      if (url.endsWith(`/requests/${REQ}`)) return Response.json({ fields: { clientId: { stringValue: 'owner1' }, title: { stringValue: 'Clean my house' } } })
      if (url.includes('/users/owner1/tokens')) return Response.json({ documents: [
        { name: 'projects/proj/databases/(default)/documents/users/owner1/tokens/t1', fields: { token: { stringValue: 'good' } } },
        { name: 'projects/proj/databases/(default)/documents/users/owner1/tokens/t2', fields: { token: { stringValue: 'stale' } } },
      ] })
      if (url.includes('messages:send')) {
        const tok = (JSON.parse(String(init?.body)) as { message: { token: string } }).message.token
        sent.push(tok)
        return new Response('{}', { status: tok === 'stale' ? 404 : 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }))
    return { sent, deleted }
  }
  const authed = async () => ({ authorization: `Bearer ${await idToken()}` })

  it('sends a push to the owner after a verified claim and removes stale tokens', async () => {
    const m = mockCloud()
    const res = await worker.fetch(post('/push', { requestId: REQ }, await authed()), env())
    expect(res.status).toBe(200)
    expect(((await res.json()) as { sent: number }).sent).toBe(1)
    expect(m.sent).toEqual(['good', 'stale'])
    expect(m.deleted.some((u) => u.endsWith('/tokens/t2'))).toBe(true)
  })
  it('refuses callers who did not claim the request', async () => {
    mockCloud({ claim: 404 })
    expect((await worker.fetch(post('/push', { requestId: REQ }, await authed()), env())).status).toBe(403)
  })
  it('does not send twice for the same claim', async () => {
    const m = mockCloud({ log: 409 })
    const res = await worker.fetch(post('/push', { requestId: REQ }, await authed()), env())
    expect(((await res.json()) as { sent: number }).sent).toBe(0)
    expect(m.sent).toEqual([])
  })
  it('rejects unverified emails and malformed request ids', async () => {
    mockCloud()
    const unverified = { authorization: `Bearer ${await idToken({ email_verified: false })}` }
    expect((await worker.fetch(post('/push', { requestId: REQ }, unverified), env())).status).toBe(403)
    expect((await worker.fetch(post('/push', { requestId: '../x' }, await authed()), env())).status).toBe(400)
  })
})
