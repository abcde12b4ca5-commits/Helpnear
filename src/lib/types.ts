import type { Timestamp } from 'firebase/firestore'

export type Role = 'client' | 'worker'
export type Urgency = 'asap' | 'this_week' | 'flexible'
export type ContactMethod = 'phone' | 'email' | 'text'

export interface AppConfig {
  signupOpen: boolean
  maintenanceMode: boolean
  maxWorkersPerRequest: number
  requestExpiryHours: number
  maxCategoriesPerWorker: number
  revealContactOnClaim: boolean
  chatEnabled: boolean
  freeRequestsPerClient: number
  feesEnabled: boolean
  promotionFeeUsd: number | null
}

export interface Category {
  id: string
  name: string
  enabled: boolean
  riskLevel: 'low' | 'regulated' | 'high'
  requiresLicenseCheck: boolean
  allowedServices: string[]
  blockedKeywords: string[]
  notes: string
  /** Two-letter state codes where this category is switched off (empty = available in every state). */
  disabledStates: string[]
}

export interface LegalDoc {
  id: string
  title: string
  version: string
  isDraft: boolean
  body: string
}

export interface UserDoc {
  role: Role
  displayName: string
  email: string
  termsVersion: string
  status: 'active' | 'suspended'
}

export interface WorkerDoc {
  displayName: string
  bio: string
  categories: string[]
  baseZip: string
  city: string
  state: string
  lat: number
  lng: number
  radiusMiles: number
  /** `${categoryId}|${cell}` for every service x covered cell. Used for feed queries and push matching. */
  matchKeys: string[]
  confirmedCategories: string[]
  licenseNote: string
  insuranceNote: string
  ratingCount: number
  ratingAverage: number
  isListed: boolean
}

export interface RequestDoc {
  id: string
  clientId: string
  categoryId: string
  categoryName: string
  zip: string
  city: string
  state: string
  lat: number
  lng: number
  cell: string
  workersNeeded: number
  /** Requests posted together share a groupId (one position per kind of worker). Older requests have neither field. */
  groupId?: string
  groupSize?: number
  /** Set only when a worker is released from a request (rules use it to tie the counter to the cancelled claim). */
  lastWorkerId?: string
  title: string
  description: string
  urgency: Urgency
  budgetRange: string
  status: 'open' | 'filled' | 'closed' | 'expired' | 'removed'
  /** Workers currently accepted (cancelled workers are subtracted). */
  claimsCount: number
  matchKey: string
  createdAt: Timestamp | null
  expiresAt: Timestamp
}

export interface ContactDoc {
  phone: string
  email: string
  preferredContactMethod: ContactMethod
}

export type ClaimStatus = 'accepted' | 'done' | 'confirmed' | 'cancelled'

export interface ClaimDoc {
  workerId: string
  requestId: string
  clientId: string
  categoryId: string
  categoryName: string
  title: string
  workerName: string
  status: ClaimStatus
  /** Client agreed to the worker's price and scope (reset when the worker edits them). */
  clientAgreed: boolean
  quotedCents: number
  note: string
  createdAt: Timestamp | null
  finalCents?: number
  doneAt?: Timestamp | null
  confirmedAt?: Timestamp | null
  cancelledBy?: 'worker' | 'client'
  cancelReason?: string
  cancelledAt?: Timestamp | null
}

export interface ReviewDoc {
  id: string
  requestId: string
  workerId: string
  clientId: string
  rating: number
  text: string
  createdAt: Timestamp | null
}

export type NotificationType = 'claim' | 'agreed' | 'done' | 'confirmed' | 'reopened' | 'cancelled_by_worker' | 'cancelled_by_client'

export interface NotificationDoc {
  id: string
  type: NotificationType
  requestId: string
  fromId: string
  message: string
  read: boolean
  createdAt: Timestamp | null
}

export interface MessageDoc {
  id: string
  senderId: string
  text: string
  createdAt: Timestamp | null
}

export interface ThreadDoc {
  requestId: string
  workerId: string
  clientId: string
  blockedBy: string
  reported: boolean
}
