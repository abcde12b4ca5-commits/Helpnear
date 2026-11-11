import {
  Timestamp,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'
import { getAppConfig } from './catalog'
import { notifyClaim } from './push'
import type { ClaimDoc, ContactDoc, RequestDoc, Urgency, WorkerDoc } from './types'

export const PAGE_SIZE = 20
export type Cursor = QueryDocumentSnapshot<DocumentData> | null

const toRequest = (d: QueryDocumentSnapshot<DocumentData>): RequestDoc => ({ ...(d.data() as Omit<RequestDoc, 'id'>), id: d.id })

export interface NewRequestInput {
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
  contact: ContactDoc
}

export async function createRequest(input: NewRequestInput): Promise<string> {
  const config = await getAppConfig()
  const hours = Math.min(config.requestExpiryHours, 160) // stays under the 7-day rules cap even with clock skew
  const ref = doc(collection(db, 'requests'))
  const { contact, ...rest } = input
  const batch = writeBatch(db)
  batch.set(doc(db, `rate/${input.clientId}`), { lastPostAt: serverTimestamp() })
  batch.set(ref, {
    ...rest,
    status: 'open',
    claimsCount: 0,
    matchKey: `${input.categoryId}|${input.zoneId}`,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + hours * 3600_000),
    promoted: false,
  })
  batch.set(doc(db, `requests/${ref.id}/private/contact`), contact)
  await batch.commit()
  return ref.id
}

export async function getMyRequests(clientId: string, after: Cursor): Promise<{ items: RequestDoc[]; cursor: Cursor; done: boolean }> {
  const base = [where('clientId', '==', clientId), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)]
  const snap = await getDocs(query(collection(db, 'requests'), ...(after ? [...base, startAfter(after)] : base)))
  return { items: snap.docs.map(toRequest), cursor: snap.docs[snap.docs.length - 1] ?? after, done: snap.size < PAGE_SIZE }
}

export async function closeRequest(id: string) {
  await updateDoc(doc(db, `requests/${id}`), { status: 'closed' })
}

export async function getClaimers(requestId: string): Promise<ClaimDoc[]> {
  const snap = await getDocs(collection(db, `requests/${requestId}/claims`))
  return snap.docs.map((d) => d.data() as ClaimDoc)
}

/** Worker feed. matchKeys is at most 30 (5 categories x 6 zones). One query, cursor paging, no listeners. */
export async function getFeed(worker: WorkerDoc, after: Cursor): Promise<{ items: RequestDoc[]; cursor: Cursor; done: boolean }> {
  const keys = worker.categories.flatMap((c) => worker.zones.map((z) => `${c}|${z}`)).slice(0, 30)
  if (keys.length === 0) return { items: [], cursor: after, done: true }
  const base = [where('matchKey', 'in', keys), where('status', '==', 'open'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)]
  const snap = await getDocs(query(collection(db, 'requests'), ...(after ? [...base, startAfter(after)] : base)))
  const now = Date.now()
  // Expired requests cannot be filtered in the query (needs a different sort); filter here. Rules also block claiming them.
  const items = snap.docs.map(toRequest).filter((r) => r.expiresAt.toMillis() > now)
  return { items, cursor: snap.docs[snap.docs.length - 1] ?? after, done: snap.size < PAGE_SIZE }
}

export async function claimRequest(requestId: string, workerId: string, workerName: string): Promise<void> {
  const config = await getAppConfig()
  await runTransaction(db, async (tx) => {
    const reqRef = doc(db, `requests/${requestId}`)
    const claimRef = doc(db, `requests/${requestId}/claims/${workerId}`)
    const [reqSnap, claimSnap] = await Promise.all([tx.get(reqRef), tx.get(claimRef)])
    if (!reqSnap.exists()) throw new Error('This request no longer exists.')
    const r = reqSnap.data() as RequestDoc
    if (claimSnap.exists()) throw new Error('You already claimed this request.')
    if (r.status !== 'open' || r.expiresAt.toMillis() <= Date.now()) throw new Error('This request is no longer open.')
    if (r.claimsCount >= config.maxClaimsPerRequest) throw new Error('This request already has the maximum number of workers.')
    tx.update(reqRef, { claimsCount: r.claimsCount + 1 })
    tx.set(claimRef, { workerId, requestId, workerName, createdAt: serverTimestamp() })
    tx.set(doc(db, `notifications/${r.clientId}/items/${requestId}_${workerId}`), {
      type: 'claim', requestId, workerId, message: `A worker claimed your request: ${r.title}`.slice(0, 140), read: false, createdAt: serverTimestamp(),
    })
  })
  void notifyClaim(requestId) // best-effort web push to the request owner (needs VITE_WORKER_URL)
}

export async function getMyClaims(workerId: string): Promise<RequestDoc[]> {
  const snap = await getDocs(query(collectionGroup(db, 'claims'), where('workerId', '==', workerId), limit(PAGE_SIZE)))
  const ids = snap.docs.map((d) => (d.data() as ClaimDoc).requestId)
  const reqs = await Promise.all(ids.map((id) => getDoc(doc(db, `requests/${id}`))))
  return reqs.filter((s) => s.exists()).map((s) => ({ ...(s.data() as Omit<RequestDoc, 'id'>), id: s.id }))
}

export async function getContact(requestId: string): Promise<ContactDoc> {
  const snap = await getDoc(doc(db, `requests/${requestId}/private/contact`))
  if (!snap.exists()) throw new Error('Contact details are not available.')
  return snap.data() as ContactDoc
}
