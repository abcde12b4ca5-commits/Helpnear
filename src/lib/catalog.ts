import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from './firebase'
import { cached } from './cache'
import type { AppConfig, Category, LegalDoc } from './types'

const TTL = 10 * 60_000

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
}

export function getAppConfig(): Promise<AppConfig> {
  return cached('config', TTL, async () => {
    const snap = await getDoc(doc(db, 'config/app'))
    return { ...DEFAULT_CONFIG, ...(snap.exists() ? (snap.data() as Partial<AppConfig>) : {}) }
  })
}

export function getCategories(): Promise<Category[]> {
  return cached('categories', TTL, async () => {
    const snap = await getDocs(collection(db, 'categories'))
    return snap.docs.map((d) => ({ ...(d.data() as Omit<Category, 'id'>), id: d.id })).sort((a, b) => a.name.localeCompare(b.name))
  })
}

export function getLegal(id: string): Promise<LegalDoc | null> {
  return cached(`legal:${id}`, TTL, async () => {
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
