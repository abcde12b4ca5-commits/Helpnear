import {
  Timestamp,
  collection,
  collectionGroup,
  count,
  doc,
  getAggregateFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  sum,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'
import { getAppConfig } from './catalog'
import { haversineMiles } from './geo'
import { sendNotification } from './notifications'
import { notifyEvent, notifyNewRequest } from './push'
import type { ClaimDoc, ClaimStatus, ContactDoc, RequestDoc, Urgency, WorkerDoc } from './types'

export const PAGE_SIZE = 20
export type Cursor = QueryDocumentSnapshot<DocumentData> | null

const toRequest = (d: QueryDocumentSnapshot<DocumentData>): RequestDoc => ({ ...(d.data() as Omit<RequestDoc, 'id'>), id: d.id })
const toClaim = (d: QueryDocumentSnapshot<DocumentData>): ClaimDoc => d.data() as ClaimDoc

// ---------------------------------------------------------------- client: create / list / close

export interface PositionInput {
  categoryId: string
  categoryName: string
  workersNeeded: number
  title: string
  description: string
}

export interface NewRequestInput {
  clientId: string
  zip: string
  city: string
  state: string
  lat: number
  lng: number
  cell: string
  urgency: Urgency
  budgetRange: string
  contact: ContactDoc
  /** 1 to 5 positions. Same job for several people = one position with workersNeeded > 1. Different jobs = several positions. */
  positions: PositionInput[]
}

/** Seconds the client still has to wait before the next post (the rules allow one post per 60 seconds). 0 = can post now. */
export async function getPostCooldownSeconds(clientId: string): Promise<number> {
  try {
    const snap = await getDoc(doc(db, `rate/${clientId}`))
    const last = snap.exists() ? (snap.data().lastPostAt as Timestamp | undefined) : undefined
    return last ? Math.max(0, Math.ceil(60 - (Date.now() - last.toMillis()) / 1000)) : 0
  } catch { return 0 }
}

/** Posts all positions together (one request doc each, ids `${groupId}-${index}`). Returns the request ids. */
export async function createRequests(input: NewRequestInput): Promise<string[]> {
  const config = await getAppConfig()
  const hours = Math.min(config.requestExpiryHours, 160) // stays under the 7-day rules cap even with clock skew
  const groupId = doc(collection(db, 'requests')).id // 20 letters and digits
  const { contact, positions, ...shared } = input
  const batch = writeBatch(db)
  batch.set(doc(db, `rate/${input.clientId}`), { lastPostAt: serverTimestamp(), groupId })
  const ids = positions.map((p, i) => {
    const ref = doc(db, `requests/${groupId}-${i}`)
    batch.set(ref, {
      ...shared, ...p,
      groupId, groupSize: positions.length,
      status: 'open',
      claimsCount: 0,
      matchKey: `${p.categoryId}|${input.cell}`,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + hours * 3600_000),
      promoted: false,
    })
    batch.set(doc(db, `requests/${ref.id}/private/contact`), contact)
    return ref.id
  })
  await batch.commit()
  for (const id of ids) void notifyNewRequest(id) // best-effort push to matching workers (needs VITE_WORKER_URL)
  return ids
}

export async function getMyRequests(clientId: string, after: Cursor): Promise<{ items: RequestDoc[]; cursor: Cursor; done: boolean }> {
  const base = [where('clientId', '==', clientId), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)]
  const snap = await getDocs(query(collection(db, 'requests'), ...(after ? [...base, startAfter(after)] : base)))
  return { items: snap.docs.map(toRequest), cursor: snap.docs[snap.docs.length - 1] ?? after, done: snap.size < PAGE_SIZE }
}

/** Stops new workers from accepting. Workers already accepted can still finish the job. */
export async function closeRequest(id: string) {
  await updateDoc(doc(db, `requests/${id}`), { status: 'closed' })
}

/** Every worker who responded to this request (accepted, done, confirmed or cancelled). */
export async function getRequestClaims(requestId: string): Promise<ClaimDoc[]> {
  const snap = await getDocs(collection(db, `requests/${requestId}/claims`))
  return snap.docs.map(toClaim).sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))
}

// ---------------------------------------------------------------- worker: feed

export interface FeedState {
  chunks: string[][]
  cursors: Cursor[]
  ended: boolean[]
}

/** Firestore `in` takes at most 30 values, so the worker's matchKeys are split into chunks of 30 (one query each). */
export function newFeedState(worker: WorkerDoc): FeedState {
  const chunks: string[][] = []
  for (let i = 0; i < worker.matchKeys.length; i += 30) chunks.push(worker.matchKeys.slice(i, i + 30))
  return { chunks, cursors: chunks.map(() => null), ended: chunks.map(() => false) }
}

/** Next page for every chunk that still has results, merged newest first and filtered by exact distance and expiry. */
export async function loadFeed(worker: WorkerDoc, state: FeedState): Promise<{ items: RequestDoc[]; state: FeedState; done: boolean }> {
  const perChunk = Math.min(PAGE_SIZE, Math.max(5, Math.floor(40 / Math.max(1, state.chunks.length))))
  const next: FeedState = { chunks: state.chunks, cursors: [...state.cursors], ended: [...state.ended] }
  const pages = await Promise.all(state.chunks.map(async (keys, i) => {
    if (state.ended[i]) return []
    const base = [where('matchKey', 'in', keys), where('status', '==', 'open'), orderBy('createdAt', 'desc'), limit(perChunk)]
    const snap = await getDocs(query(collection(db, 'requests'), ...(state.cursors[i] ? [...base, startAfter(state.cursors[i])] : base)))
    next.cursors[i] = snap.docs[snap.docs.length - 1] ?? state.cursors[i]
    next.ended[i] = snap.size < perChunk
    return snap.docs.map(toRequest)
  }))
  const now = Date.now()
  const items = pages.flat()
    .filter((r) => r.expiresAt.toMillis() > now && haversineMiles(worker.lat, worker.lng, r.lat, r.lng) <= worker.radiusMiles)
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
  return { items, state: next, done: next.ended.every(Boolean) }
}

const MAX_DECLINED = 300
/** One small doc per worker (one read per session, one write per decline). Declining only hides the request for this worker. */
export async function getDeclined(workerId: string): Promise<string[]> {
  const snap = await getDoc(doc(db, `workers/${workerId}/private/declined`))
  return snap.exists() ? ((snap.data().ids as string[]) ?? []) : []
}

export async function declineRequest(workerId: string, current: string[], requestId: string): Promise<string[]> {
  const ids = [...current.filter((x) => x !== requestId), requestId].slice(-MAX_DECLINED)
  await setDoc(doc(db, `workers/${workerId}/private/declined`), { ids })
  return ids
}

// ---------------------------------------------------------------- claim lifecycle

const claimRef = (requestId: string, workerId: string) => doc(db, `requests/${requestId}/claims/${workerId}`)

/** Worker accepts a request with a price and a short scope note. Takes one of the client's open worker slots. */
export async function acceptRequest(args: { requestId: string; workerId: string; workerName: string; quotedCents: number; note: string }): Promise<void> {
  const { requestId, workerId, workerName, quotedCents, note } = args
  let r!: RequestDoc
  await runTransaction(db, async (tx) => {
    const reqRef = doc(db, `requests/${requestId}`)
    const [reqSnap, cSnap] = await Promise.all([tx.get(reqRef), tx.get(claimRef(requestId, workerId))])
    if (!reqSnap.exists()) throw new Error('This request no longer exists.')
    r = reqSnap.data() as RequestDoc
    if (cSnap.exists()) throw new Error('You already responded to this request.')
    if (r.status !== 'open' || r.expiresAt.toMillis() <= Date.now()) throw new Error('This request is no longer open.')
    if (r.claimsCount >= r.workersNeeded) throw new Error('This request already has all the workers it needs.')
    const n = r.claimsCount + 1
    tx.update(reqRef, { claimsCount: n, status: n >= r.workersNeeded ? 'filled' : 'open' })
    tx.set(claimRef(requestId, workerId), {
      workerId, requestId, clientId: r.clientId, categoryId: r.categoryId, categoryName: r.categoryName, title: r.title, workerName,
      status: 'accepted', clientAgreed: false, quotedCents, note, createdAt: serverTimestamp(),
    })
  })
  await sendNotification({ toId: r.clientId, fromId: workerId, workerId, requestId, type: 'claim', message: `${workerName} accepted your request: ${r.title}` })
  void notifyEvent('accepted', requestId)
}

/** Worker changes price or scope while the job is still being agreed. Resets the client's agreement. */
export async function editQuote(args: { requestId: string; workerId: string; clientId: string; quotedCents: number; note: string }): Promise<void> {
  await updateDoc(claimRef(args.requestId, args.workerId), { quotedCents: args.quotedCents, note: args.note, clientAgreed: false })
  await sendNotification({ toId: args.clientId, fromId: args.workerId, workerId: args.workerId, requestId: args.requestId, type: 'claim', message: 'A worker updated the price or scope. Please review it.' })
  void notifyEvent('accepted', args.requestId)
}

/** Client agrees to the worker's price and scope. The worker can mark the job done only after this. */
export async function agreeClaim(c: ClaimDoc): Promise<void> {
  await updateDoc(claimRef(c.requestId, c.workerId), { clientAgreed: true })
  await sendNotification({ toId: c.workerId, fromId: c.clientId, workerId: c.workerId, requestId: c.requestId, type: 'agreed', message: `Price agreed for: ${c.title}. You can do the work.` })
  void notifyEvent('agreed', c.requestId, c.workerId)
}

/** Worker says the service was done and states the final amount. The client still has to confirm. */
export async function markDone(c: ClaimDoc, finalCents: number): Promise<void> {
  await updateDoc(claimRef(c.requestId, c.workerId), { status: 'done', finalCents, doneAt: serverTimestamp() })
  await sendNotification({ toId: c.clientId, fromId: c.workerId, workerId: c.workerId, requestId: c.requestId, type: 'done', message: `${c.workerName} marked the service as done: ${c.title}. Please confirm.` })
  void notifyEvent('done', c.requestId)
}

/** Client confirms the service was done. This is what counts in the worker's completed jobs and earnings. */
export async function confirmDone(c: ClaimDoc): Promise<void> {
  await updateDoc(claimRef(c.requestId, c.workerId), { status: 'confirmed', confirmedAt: serverTimestamp() })
  await sendNotification({ toId: c.workerId, fromId: c.clientId, workerId: c.workerId, requestId: c.requestId, type: 'confirmed', message: `The client confirmed the service: ${c.title}.` })
  void notifyEvent('confirmed', c.requestId, c.workerId)
}

/** Client says the work is not done (or the amount is wrong): back to "accepted", the worker can mark it done again. */
export async function reopenClaim(c: ClaimDoc): Promise<void> {
  await updateDoc(claimRef(c.requestId, c.workerId), { status: 'accepted' })
  await sendNotification({ toId: c.workerId, fromId: c.clientId, workerId: c.workerId, requestId: c.requestId, type: 'reopened', message: `The client says the work is not finished: ${c.title}.` })
  void notifyEvent('reopened', c.requestId, c.workerId)
}

/** Either side cancels before the job is marked done. Frees the worker slot so another worker can accept. */
export async function cancelClaim(c: ClaimDoc, by: 'worker' | 'client', reason: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const reqRef = doc(db, `requests/${c.requestId}`)
    const [reqSnap, cSnap] = await Promise.all([tx.get(reqRef), tx.get(claimRef(c.requestId, c.workerId))])
    if (!reqSnap.exists() || !cSnap.exists()) throw new Error('This job no longer exists.')
    if ((cSnap.data() as ClaimDoc).status !== 'accepted') throw new Error('This job can no longer be cancelled.')
    const r = reqSnap.data() as RequestDoc
    tx.update(claimRef(c.requestId, c.workerId), { status: 'cancelled', cancelledBy: by, cancelReason: reason, cancelledAt: serverTimestamp() })
    tx.update(reqRef, { claimsCount: Math.max(0, r.claimsCount - 1), status: r.status === 'filled' ? 'open' : r.status, lastWorkerId: c.workerId })
  })
  const toWorker = by === 'client'
  await sendNotification({
    toId: toWorker ? c.workerId : c.clientId, fromId: toWorker ? c.clientId : c.workerId, workerId: c.workerId, requestId: c.requestId,
    type: toWorker ? 'cancelled_by_client' : 'cancelled_by_worker', message: `The ${by} cancelled: ${c.title}.`,
  })
  void notifyEvent(toWorker ? 'cancelled_by_client' : 'cancelled_by_worker', c.requestId, toWorker ? c.workerId : undefined)
}

// ---------------------------------------------------------------- dashboards

export async function getWorkerClaims(workerId: string, status: ClaimStatus | null, after: Cursor): Promise<{ items: ClaimDoc[]; cursor: Cursor; done: boolean }> {
  const base = [where('workerId', '==', workerId), ...(status ? [where('status', '==', status)] : []), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)]
  const snap = await getDocs(query(collectionGroup(db, 'claims'), ...(after ? [...base, startAfter(after)] : base)))
  return { items: snap.docs.map(toClaim), cursor: snap.docs[snap.docs.length - 1] ?? after, done: snap.size < PAGE_SIZE }
}

export interface Stats { active: number; waitingConfirmation: number; completed: number; totalCents: number; requests?: number }

/** Counts and sums are computed by Firestore aggregation queries (about 1 read per 1000 matching docs), so they cannot be forged. */
async function claimStats(field: 'workerId' | 'clientId', uid: string): Promise<Stats> {
  const q = (status: ClaimStatus) => query(collectionGroup(db, 'claims'), where(field, '==', uid), where('status', '==', status))
  const [active, waiting, done] = await Promise.all([
    getAggregateFromServer(q('accepted'), { n: count() }),
    getAggregateFromServer(q('done'), { n: count() }),
    getAggregateFromServer(q('confirmed'), { n: count(), total: sum('finalCents') }),
  ])
  return { active: active.data().n, waitingConfirmation: waiting.data().n, completed: done.data().n, totalCents: done.data().total ?? 0 }
}

export const getWorkerStats = (uid: string) => claimStats('workerId', uid)

export async function getClientStats(uid: string): Promise<Stats> {
  const [s, r] = await Promise.all([
    claimStats('clientId', uid),
    getAggregateFromServer(query(collection(db, 'requests'), where('clientId', '==', uid)), { n: count() }),
  ])
  return { ...s, requests: r.data().n }
}

export async function getContact(requestId: string): Promise<ContactDoc> {
  const snap = await getDoc(doc(db, `requests/${requestId}/private/contact`))
  if (!snap.exists()) throw new Error('Contact details are not available.')
  return snap.data() as ContactDoc
}
