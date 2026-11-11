import { Timestamp, collection, collectionGroup, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, where } from 'firebase/firestore'
import { auth, db, WORKER_URL } from './firebase'
import { adminWrite, setUserSuspended } from './admin'
import { getAppConfig } from './catalog'
import type { ClaimDoc, RequestDoc, Role, StrikeDoc, StrikeType } from './types'

/** Admin-side fair-use tools. Every change is written together with an audit-log entry (see adminWrite). */

export async function getUserStrikes(userId: string): Promise<StrikeDoc[]> {
  const snap = await getDocs(query(collection(db, 'strikes'), where('userId', '==', userId), limit(50)))
  return snap.docs.map((d) => ({ ...(d.data() as Omit<StrikeDoc, 'id'>), id: d.id })).sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
}

export function addStrike(adminId: string, userId: string, role: Role, type: StrikeType, note: string, requestId = '') {
  return adminWrite(adminId, `strike-${type}`, `users/${userId}`, (b) => {
    b.set(doc(collection(db, 'strikes')), { userId, role, type, requestId, note: note.slice(0, 300), createdAt: serverTimestamp(), by: 'admin' })
  })
}

export function removeStrike(adminId: string, strikeId: string) {
  return adminWrite(adminId, 'strike-removed', `strikes/${strikeId}`, (b) => b.delete(doc(db, `strikes/${strikeId}`)))
}

export function freezeUser(adminId: string, userId: string, days: number, reason: string) {
  return adminWrite(adminId, 'freeze-user', `users/${userId}`, (b) => {
    b.update(doc(db, `users/${userId}`), { frozenUntil: Timestamp.fromMillis(Date.now() + days * 86_400_000), frozenReason: reason.slice(0, 200) })
  })
}

/** Lifts a freeze and clears the "needs review" flag. (The field is set to now, never null: the rules compare it with the clock.) */
export function unfreezeUser(adminId: string, userId: string) {
  return adminWrite(adminId, 'unfreeze-user', `users/${userId}`, (b) => {
    b.update(doc(db, `users/${userId}`), { frozenUntil: Timestamp.now(), frozenReason: '', needsReview: false, reviewReason: '' })
  })
}

/**
 * Ladder for confirmed bad conduct (a report an admin upheld): 1st time a warning, 2nd a freeze for freezeDays, 3rd and later a ban.
 * Returns what was done, so the admin sees it.
 */
export async function escalate(adminId: string, userId: string, role: Role, reason: string): Promise<string> {
  const [cfg, strikes] = await Promise.all([getAppConfig(), getUserStrikes(userId)])
  const earlier = strikes.filter((s) => s.type === 'warning' || s.type === 'conduct').length
  if (earlier === 0) { await addStrike(adminId, userId, role, 'warning', reason); return 'Warning recorded (visible to the user as a strike note).' }
  if (earlier === 1) {
    await addStrike(adminId, userId, role, 'conduct', reason)
    await freezeUser(adminId, userId, cfg.freezeDays, reason || 'Conduct')
    return `Account frozen for ${cfg.freezeDays} days.`
  }
  await addStrike(adminId, userId, role, 'conduct', reason)
  await setUserSuspended(adminId, userId, role, true)
  return 'Account suspended (ban).'
}

/** Fraud: suspend the user, and for a worker remove every confirmed job (it stops counting in completed jobs and earnings). */
export async function banAndVoid(adminId: string, userId: string, role: Role): Promise<number> {
  await setUserSuspended(adminId, userId, role, true)
  if (role !== 'worker') return 0
  const snap = await getDocs(query(collectionGroup(db, 'claims'), where('workerId', '==', userId), where('status', '==', 'confirmed'), limit(200)))
  if (snap.empty) return 0
  await adminWrite(adminId, 'void-earnings', `users/${userId}`, (b) => {
    for (const d of snap.docs) b.update(d.ref, { status: 'voided', resolution: 'Removed by an admin (fraud)' })
  })
  return snap.size
}

export async function listDisputes(): Promise<ClaimDoc[]> {
  const snap = await getDocs(query(collectionGroup(db, 'claims'), where('status', '==', 'disputed'), orderBy('createdAt', 'asc'), limit(20)))
  return snap.docs.map((d) => d.data() as ClaimDoc)
}

export type DisputeOutcome = 'confirm' | 'resume' | 'cancel'

/** Admin decides a dispute. `strikeTo` (optional) records a strike for the side at fault. */
export async function resolveDispute(adminId: string, c: ClaimDoc, outcome: DisputeOutcome, opts: { finalCents?: number; note: string; strikeTo?: 'worker' | 'client' | null }): Promise<void> {
  const claimRef = doc(db, `requests/${c.requestId}/claims/${c.workerId}`)
  const note = opts.note.slice(0, 300)
  let req: RequestDoc | null = null
  if (outcome === 'cancel') {
    const snap = await getDoc(doc(db, `requests/${c.requestId}`))
    if (!snap.exists()) throw new Error('The request no longer exists.')
    req = snap.data() as RequestDoc
  }
  await adminWrite(adminId, `dispute-${outcome}`, `requests/${c.requestId}/claims/${c.workerId}`, (b) => {
    if (outcome === 'confirm') b.update(claimRef, { status: 'confirmed', finalCents: opts.finalCents ?? c.finalCents ?? c.quotedCents, confirmedAt: serverTimestamp(), resolution: note })
    else if (outcome === 'resume') b.update(claimRef, { status: 'accepted', resolution: note })
    else if (req) {
      b.update(claimRef, { status: 'cancelled', cancelledBy: 'admin', cancelReason: note.length >= 3 ? note : 'Cancelled by an admin', cancelledAt: serverTimestamp(), resolution: note })
      b.update(doc(db, `requests/${c.requestId}`), { claimsCount: Math.max(0, req.claimsCount - 1), status: req.status === 'filled' ? 'open' : req.status, lastWorkerId: c.workerId })
    }
    if (opts.strikeTo) {
      const userId = opts.strikeTo === 'worker' ? c.workerId : c.clientId
      b.set(doc(collection(db, 'strikes')), { userId, role: opts.strikeTo, type: 'dispute', requestId: c.requestId, note, createdAt: serverTimestamp(), by: 'admin' })
    }
  })
}

export interface PolicyRun { disabled?: boolean; autoConfirmed: number; released: number; strikes: number; frozen: number; flagged: number; stoppedEarly: boolean }

/** Runs the fair-use rules now (the same code the schedule runs). Needs the edge worker (VITE_WORKER_URL) and an admin account. */
export async function runPolicyNow(): Promise<PolicyRun> {
  if (!WORKER_URL || !auth.currentUser) throw new Error('The edge worker is not configured (VITE_WORKER_URL).')
  const res = await fetch(`${WORKER_URL}/run-policy`, { method: 'POST', headers: { authorization: `Bearer ${await auth.currentUser.getIdToken()}` } })
  if (!res.ok) throw new Error(`The worker answered ${res.status}.`)
  return (await res.json()) as PolicyRun
}
