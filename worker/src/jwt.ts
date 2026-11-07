// Minimal RS256 JWT helpers on WebCrypto (works in Cloudflare Workers and Node 20+).
const enc = new TextEncoder()

export function b64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === 'string' ? enc.encode(data) : new Uint8Array(data)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const RSA = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const

export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey('pkcs8', der, RSA, false, ['sign'])
}

export async function signJwt(claims: Record<string, unknown>, pem: string, header: Record<string, unknown> = {}): Promise<string> {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', ...header }))
  const body = b64url(JSON.stringify(claims))
  const sig = await crypto.subtle.sign(RSA.name, await importPrivateKey(pem), enc.encode(`${head}.${body}`))
  return `${head}.${body}.${b64url(sig)}`
}

export interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }

export async function importJwk(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, RSA, false, ['verify'])
}

export class JwtError extends Error {}

/** Verifies signature + exp/iat. Callers check iss/aud/sub themselves. */
export async function verifyJwt(token: string, getKey: (kid: string) => Promise<CryptoKey | null>, now = Date.now()): Promise<Record<string, unknown>> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new JwtError('malformed token')
  let header: { alg?: string; kid?: string }
  let payload: Record<string, unknown>
  try {
    header = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])))
    payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])))
  } catch { throw new JwtError('malformed token') }
  if (header.alg !== 'RS256' || !header.kid) throw new JwtError('unsupported algorithm')
  const key = await getKey(header.kid)
  if (!key) throw new JwtError('unknown key')
  const ok = await crypto.subtle.verify(RSA.name, key, fromB64url(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`))
  if (!ok) throw new JwtError('bad signature')
  const sec = Math.floor(now / 1000)
  if (typeof payload.exp !== 'number' || payload.exp <= sec) throw new JwtError('token expired')
  if (typeof payload.iat !== 'number' || payload.iat > sec + 300) throw new JwtError('token issued in the future')
  return payload
}
