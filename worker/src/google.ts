import { JwtError, importJwk, signJwt, verifyJwt, type Jwk } from './jwt'

export interface ServiceAccount { client_email: string; private_key: string }
export interface Env {
  FIREBASE_SA_JSON: string
  TURNSTILE_SECRET: string
  FIREBASE_PROJECT_ID: string
  FIREBASE_APP_ID: string
  ALLOWED_ORIGINS: string
  SITE_URL: string
  /** Max workers pushed per new request. Keep it small on the Cloudflare free plan (50 subrequests per call). Default 10. */
  MAX_NEW_PUSH?: string
  /** Scheduled fair-use run: subrequest budget (free plan allows 50 per invocation). Default 40. */
  CRON_SUBREQUEST_LIMIT?: string
  /** Scheduled fair-use run: items handled per task per run. Default 5. */
  CRON_MAX_ITEMS?: string
}

const SCOPES = 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore'
let tokenCache: { token: string; exp: number } | null = null

export function parseServiceAccount(env: Env): ServiceAccount {
  const sa = JSON.parse(env.FIREBASE_SA_JSON) as ServiceAccount
  if (!sa.client_email || !sa.private_key) throw new Error('FIREBASE_SA_JSON is missing client_email or private_key')
  return sa
}

/** OAuth2 access token for the service account (cached until one minute before expiry). */
export async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token
  const assertion = await signJwt({ iss: sa.client_email, sub: sa.client_email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, sa.private_key)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) throw new Error(`token endpoint HTTP ${res.status}`)
  const json = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = { token: json.access_token, exp: now + json.expires_in }
  return json.access_token
}

export function resetAccessTokenCache() { tokenCache = null }

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
let jwksCache: { keys: Jwk[]; at: number } | null = null

async function getFirebaseKey(kid: string): Promise<CryptoKey | null> {
  if (!jwksCache || Date.now() - jwksCache.at > 3600_000 || !jwksCache.keys.some((k) => k.kid === kid)) {
    const res = await fetch(JWKS_URL)
    if (!res.ok) throw new Error(`jwks HTTP ${res.status}`)
    jwksCache = { keys: ((await res.json()) as { keys: Jwk[] }).keys, at: Date.now() }
  }
  const jwk = jwksCache.keys.find((k) => k.kid === kid)
  return jwk ? importJwk(jwk) : null
}

export interface VerifiedUser { uid: string; emailVerified: boolean }

/** Verifies a Firebase Auth ID token (signature, expiry, issuer, audience). */
export async function verifyIdToken(idToken: string, projectId: string, getKey: (kid: string) => Promise<CryptoKey | null> = getFirebaseKey, now = Date.now()): Promise<VerifiedUser> {
  const p = await verifyJwt(idToken, getKey, now)
  if (p.aud !== projectId || p.iss !== `https://securetoken.google.com/${projectId}`) throw new JwtError('wrong audience or issuer')
  if (typeof p.sub !== 'string' || !p.sub) throw new JwtError('missing subject')
  return { uid: p.sub, emailVerified: p.email_verified === true }
}

// ---- Firestore REST (service account bypasses security rules; used only for narrowly scoped reads/writes) ----
export const docsUrl = (projectId: string) => `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`

export async function fsFetch(sa: ServiceAccount, url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken(sa)
  return fetch(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, 'content-type': 'application/json' } })
}

export type FsFields = Record<string, { stringValue?: string; booleanValue?: boolean; integerValue?: string; doubleValue?: number; timestampValue?: string }>
export const fsString = (f: FsFields | undefined, key: string): string => f?.[key]?.stringValue ?? ''
export const fsBool = (f: FsFields | undefined, key: string): boolean => f?.[key]?.booleanValue === true
export const fsNum = (f: FsFields | undefined, key: string, fallback = 0): number => {
  const v = f?.[key]
  if (!v) return fallback
  if (v.integerValue !== undefined) return Number(v.integerValue)
  return v.doubleValue ?? fallback
}
/** Timestamp field as epoch milliseconds (0 when missing). */
export const fsTime = (f: FsFields | undefined, key: string): number => {
  const t = f?.[key]?.timestampValue
  return t ? Date.parse(t) || 0 : 0
}
