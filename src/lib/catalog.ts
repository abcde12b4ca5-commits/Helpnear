import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db, ensureAppCheck } from './firebase'
import { cachedPersistent } from './cache'
import type { AppConfig, Category, LegalDoc } from './types'

// How long each kind of public data may be reused WITHOUT reading Firestore again (kept in the browser, so reloads and new tabs reuse it too).
// config: short, so switching on maintenance mode reaches visitors within minutes. categories/legal: change rarely; the server rules still enforce them on every write.
const CONFIG_TTL = 5 * 60_000
const CATEGORIES_TTL = 30 * 60_000
const LEGAL_TTL = 60 * 60_000

export const DEFAULT_CONFIG: AppConfig = {
  signupOpen: true,
  maintenanceMode: false,
  maxWorkersPerRequest: 5,
  requestExpiryHours: 72,
  maxCategoriesPerWorker: 5,
  revealContactOnClaim: true,
  chatEnabled: false,
  freeRequestsPerClient: 0,
  feesEnabled: false,
  promotionFeeUsd: null,
  autoRulesEnabled: true,
  penaltyWindowDays: 30,
  clientFreezeAt: 3,
  clientReviewAt: 5,
  workerFreezeAt: 2,
  workerReviewAt: 4,
  freezeDays: 7,
  noResponseHours: 48,
  noResponseStrikes: true,
  autoConfirmDays: 7,
  disputeAfterReopens: 2,
}

type RestValue = { stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean; nullValue?: null }

/** config/app is public-read, so first-time visitors can load it with one plain HTTPS request.
 *  This avoids opening the Firestore streaming channel (and its slow setup) just to check maintenance mode. */
let restBlocked = false // set after a 403: App Check is enforced, so the token-less request can never work; the SDK read below carries the token
async function fetchConfigRest(): Promise<Partial<AppConfig> | null> {
  if (restBlocked) return null
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
  if (!projectId || !apiKey || import.meta.env.VITE_USE_EMULATORS === 'true') return null
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/config/app?key=${apiKey}`)
  if (res.status === 404) return {} // document not created yet: defaults apply
  if (res.status === 403) restBlocked = true
  if (!res.ok) return null
  const json = (await res.json()) as { fields?: Record<string, RestValue> }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(json.fields ?? {})) {
    if ('booleanValue' in v) out[k] = v.booleanValue
    else if ('integerValue' in v) out[k] = Number(v.integerValue)
    else if ('doubleValue' in v) out[k] = v.doubleValue
    else if ('stringValue' in v) out[k] = v.stringValue
    else if ('nullValue' in v) out[k] = null
  }
  return out as Partial<AppConfig>
}

export function getAppConfig(): Promise<AppConfig> {
  return cachedPersistent('config', CONFIG_TTL, async () => {
    const viaRest = await fetchConfigRest().catch(() => null)
    if (viaRest) return { ...DEFAULT_CONFIG, ...viaRest }
    ensureAppCheck()
    const snap = await getDoc(doc(db, 'config/app')) // fallback: normal SDK read
    return { ...DEFAULT_CONFIG, ...(snap.exists() ? (snap.data() as Partial<AppConfig>) : {}) }
  })
}

export function getCategories(): Promise<Category[]> {
  return cachedPersistent('categories', CATEGORIES_TTL, async () => {
    ensureAppCheck()
    const snap = await getDocs(collection(db, 'categories'))
    return snap.docs.map((d) => ({ ...(d.data() as Omit<Category, 'id'>), id: d.id })).sort((a, b) => a.name.localeCompare(b.name))
  })
}

export function getLegal(id: string): Promise<LegalDoc | null> {
  return cachedPersistent(`legal:${id}`, LEGAL_TTL, async () => {
    ensureAppCheck()
    const snap = await getDoc(doc(db, `legal/${id}`))
    return snap.exists() ? { ...(snap.data() as Omit<LegalDoc, 'id'>), id: snap.id } : null
  })
}

/** Advisory only: client-side checks can be bypassed. Reports and admin moderation are the real backstop. */
export function findBlockedKeyword(text: string, keywords: string[]): string | null {
  const lower = text.toLowerCase()
  for (const k of keywords) {
    const escaped = k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(lower)) return k
  }
  return null
}
