import type { Timestamp } from 'firebase/firestore'

export type Role = 'client' | 'worker'
export type Urgency = 'asap' | 'this_week' | 'flexible'
export type ContactMethod = 'phone' | 'email' | 'text'

export interface AppConfig {
  signupOpen: boolean
  maintenanceMode: boolean
  maxClaimsPerRequest: number
  requestExpiryHours: number
  maxCategoriesPerWorker: number
  maxZonesPerWorker: number
  revealContactOnClaim: boolean
  chatEnabled: boolean
  freeRequestsPerClient: number
  feesEnabled: boolean
  promotionFeeUsd: number | null
  launchState: string
  launchCity: string
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
}

export interface Zone {
  id: string
  name: string
  state: string
  city: string
  zips: string[]
  enabled: boolean
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
  zones: string[]
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
  zoneId: string
  zoneName: string
  zip: string
  title: string
  description: string
  urgency: Urgency
  budgetRange: string
  status: 'open' | 'closed' | 'expired' | 'removed'
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

export interface ClaimDoc {
  workerId: string
  requestId: string
  workerName: string
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

export interface NotificationDoc {
  id: string
  type: 'claim'
  requestId: string
  workerId: string
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
