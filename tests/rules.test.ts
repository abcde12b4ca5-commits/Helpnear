// Firestore rules tests. Run with:  npm run test:rules  (needs Java + Firebase emulator download access)
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Timestamp,
  type DocumentData,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

let env: RulesTestEnvironment
const hours = (n: number) => Timestamp.fromMillis(Date.now() + n * 3600_000)

const ctx = (uid: string, verified = true) =>
  env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: verified })

const CELL = '9vk1'
const workerDoc = (categories: string[], cells: string[] = [CELL]) => ({
  displayName: 'W', bio: '', categories, baseZip: '77002', city: 'Houston', state: 'TX', lat: 29.76, lng: -95.36, radiusMiles: 25,
  matchKeys: categories.flatMap((c) => cells.map((cell) => `${c}|${cell}`)), confirmedCategories: categories,
  licenseNote: '', insuranceNote: '', ratingCount: 0, ratingAverage: 0, isListed: true, createdAt: Timestamp.now(),
})

const requestDoc = (id: string, over: Record<string, unknown> = {}) => ({
  clientId: 'client1', categoryId: 'cleaning', categoryName: 'Cleaning', zip: '77002', city: 'Houston', state: 'TX', lat: 29.76, lng: -95.36,
  cell: CELL, workersNeeded: 2, title: `Job ${id}`, description: 'Two bedroom apartment', urgency: 'asap', budgetRange: '',
  status: 'open', claimsCount: 0, matchKey: `cleaning|${CELL}`, createdAt: Timestamp.now(), expiresAt: hours(48), promoted: false, ...over,
})

const claimDoc = (requestId: string, workerId: string, over: Record<string, unknown> = {}) => ({
  workerId, requestId, clientId: 'client1', categoryId: 'cleaning', categoryName: 'Cleaning', title: `Job ${requestId}`, workerName: 'W',
  status: 'accepted', clientAgreed: false, quotedCents: 12000, note: 'Two hours of work', createdAt: Timestamp.now(), ...over,
})

async function seed() {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore()
    await setDoc(doc(db, 'legal/terms'), { version: 'v1' })
    await setDoc(doc(db, 'config/app'), { signupOpen: true, maxWorkersPerRequest: 5, revealContactOnClaim: true, chatEnabled: false, disputeAfterReopens: 2 })
    await setDoc(doc(db, 'categories/cleaning'), { enabled: true, disabledStates: ['NY'] })
    await setDoc(doc(db, 'categories/painting'), { enabled: true, disabledStates: [] })
    await setDoc(doc(db, 'users/client1'), { role: 'client', status: 'active' })
    await setDoc(doc(db, 'users/client2'), { role: 'client', status: 'active' })
    await setDoc(doc(db, 'users/badclient'), { role: 'client', status: 'suspended' })
    for (const w of ['w1', 'w2', 'w3']) {
      await setDoc(doc(db, `users/${w}`), { role: 'worker', status: 'active' })
      await setDoc(doc(db, `workers/${w}`), workerDoc(['cleaning']))
    }
    await setDoc(doc(db, 'users/wpaint'), { role: 'worker', status: 'active' })
    await setDoc(doc(db, 'workers/wpaint'), workerDoc(['painting']))
    await setDoc(doc(db, 'users/wfar'), { role: 'worker', status: 'active' })
    await setDoc(doc(db, 'workers/wfar'), workerDoc(['cleaning'], ['zzzz'])) // right service, other side of the country
    await setDoc(doc(db, 'admins/admin1'), { createdAt: Timestamp.now() })
    // r1: open, 2 workers wanted, none yet
    await setDoc(doc(db, 'requests/r1'), requestDoc('r1'))
    await setDoc(doc(db, 'requests/r1/private/contact'), { phone: '555', email: '', preferredContactMethod: 'phone' })
    // r2: w1 accepted, price NOT agreed yet
    await setDoc(doc(db, 'requests/r2'), requestDoc('r2', { claimsCount: 1 }))
    await setDoc(doc(db, 'requests/r2/claims/w1'), claimDoc('r2', 'w1'))
    // r3: w1 accepted and price agreed (single worker wanted, so the request is filled)
    await setDoc(doc(db, 'requests/r3'), requestDoc('r3', { claimsCount: 1, workersNeeded: 1, status: 'filled' }))
    await setDoc(doc(db, 'requests/r3/claims/w1'), claimDoc('r3', 'w1', { clientAgreed: true }))
    // r4: w1 marked it done, waiting for the client
    await setDoc(doc(db, 'requests/r4'), requestDoc('r4', { claimsCount: 1, workersNeeded: 1, status: 'filled' }))
    await setDoc(doc(db, 'requests/r4/claims/w1'), claimDoc('r4', 'w1', { clientAgreed: true, status: 'done', finalCents: 13000, doneAt: Timestamp.now() }))
    // r5: confirmed job
    await setDoc(doc(db, 'requests/r5'), requestDoc('r5', { claimsCount: 1, workersNeeded: 1, status: 'filled' }))
    await setDoc(doc(db, 'requests/r5/claims/w1'), claimDoc('r5', 'w1', { clientAgreed: true, status: 'confirmed', finalCents: 13000, doneAt: Timestamp.now(), confirmedAt: Timestamp.now() }))
    // r6: done after the client already sent it back once. r7: disputed, waiting for an admin
    await setDoc(doc(db, 'requests/r6'), requestDoc('r6', { claimsCount: 1, workersNeeded: 1, status: 'filled' }))
    await setDoc(doc(db, 'requests/r6/claims/w1'), claimDoc('r6', 'w1', { clientAgreed: true, status: 'done', finalCents: 13000, doneAt: Timestamp.now(), reopenCount: 1 }))
    await setDoc(doc(db, 'requests/r7'), requestDoc('r7', { claimsCount: 1, workersNeeded: 1, status: 'filled' }))
    await setDoc(doc(db, 'requests/r7/claims/w1'), claimDoc('r7', 'w1', { clientAgreed: true, status: 'disputed', finalCents: 13000, doneAt: Timestamp.now(), disputeBy: 'client', disputeReason: 'Not finished', disputedAt: Timestamp.now() }))
    for (const r of ['r2', 'r3', 'r4', 'r5', 'r6', 'r7']) await setDoc(doc(db, `requests/${r}/private/contact`), { phone: '555', email: '', preferredContactMethod: 'phone' })
  })
}

const GID = 'Abcdefghij1234567890' // a 20-character group id, like the one the app generates
const newRequest = (clientId: string, overrides: Record<string, unknown> = {}) => ({
  clientId, groupId: GID, groupSize: 1, categoryId: 'cleaning', categoryName: 'Cleaning', zip: '77002', city: 'Houston', state: 'TX', lat: 29.76, lng: -95.36,
  cell: CELL, workersNeeded: 2, title: 'Deep clean', description: 'Need a deep clean of 2 rooms', urgency: 'asap', budgetRange: '$100',
  status: 'open', claimsCount: 0, matchKey: `cleaning|${CELL}`, createdAt: serverTimestamp(), expiresAt: hours(72),
  promoted: false, ...overrides,
})

async function post(uid: string, verified = true, overrides: Record<string, unknown> = {}, opts: { id?: string; rateGroup?: string } = {}) {
  const db = ctx(uid, verified).firestore()
  const id = opts.id ?? `${GID}-0`
  const b = writeBatch(db)
  b.set(doc(db, `rate/${uid}`), { lastPostAt: serverTimestamp(), groupId: opts.rateGroup ?? GID })
  b.set(doc(db, `requests/${id}`), newRequest(uid, overrides))
  b.set(doc(db, `requests/${id}/private/contact`), { phone: '555', email: '', preferredContactMethod: 'phone' })
  return b.commit()
}

/** Several positions in one batch (a client who needs different kinds of workers). */
async function postGroup(uid: string, ids: string[]) {
  const db = ctx(uid).firestore()
  const b = writeBatch(db)
  b.set(doc(db, `rate/${uid}`), { lastPostAt: serverTimestamp(), groupId: GID })
  for (const id of ids) {
    b.set(doc(db, `requests/${id}`), newRequest(uid, { groupSize: ids.length, categoryId: id.endsWith('-1') ? 'painting' : 'cleaning', categoryName: id.endsWith('-1') ? 'Painting' : 'Cleaning', matchKey: `${id.endsWith('-1') ? 'painting' : 'cleaning'}|${CELL}` }))
    b.set(doc(db, `requests/${id}/private/contact`), { phone: '555', email: '', preferredContactMethod: 'phone' })
  }
  return b.commit()
}

/** A worker accepts: counter + status on the request and the claim doc, in one transaction (same as the app). */
async function accept(uid: string, requestId = 'r1', over: Record<string, unknown> = {}) {
  const db = ctx(uid).firestore()
  return runTransaction(db, async (tx) => {
    const ref = doc(db, `requests/${requestId}`)
    const snap = await tx.get(ref)
    const r = snap.data() as { claimsCount: number; workersNeeded: number }
    const n = r.claimsCount + 1
    tx.update(ref, { claimsCount: n, status: n >= r.workersNeeded ? 'filled' : 'open' })
    tx.set(doc(db, `requests/${requestId}/claims/${uid}`), {
      workerId: uid, requestId, clientId: 'client1', categoryId: 'cleaning', categoryName: 'Cleaning', title: `Job ${requestId}`, workerName: 'W',
      status: 'accepted', clientAgreed: false, quotedCents: 12000, note: 'Two hours of work', createdAt: serverTimestamp(), ...over,
    })
  })
}

/** Either side cancels: claim -> cancelled and request counter -1, in one transaction (same as the app). */
async function cancel(uid: string, requestId: string, workerId: string) {
  const db = ctx(uid).firestore()
  return runTransaction(db, async (tx) => {
    const rref = doc(db, `requests/${requestId}`)
    const r = (await tx.get(rref)).data() as { claimsCount: number; status: string }
    const agreed = ((await tx.get(doc(db, `requests/${requestId}/claims/${workerId}`))).data() as { clientAgreed: boolean }).clientAgreed === true
    tx.update(doc(db, `requests/${requestId}/claims/${workerId}`), {
      status: 'cancelled', cancelledBy: uid === workerId ? 'worker' : 'client', cancelReason: 'Plans changed', cancelledAt: serverTimestamp(), cancelWasLate: agreed,
    })
    tx.update(rref, { claimsCount: r.claimsCount - 1, status: r.status === 'filled' ? 'open' : r.status, lastWorkerId: workerId })
  })
}

async function readDoc(path: string) {
  let data: DocumentData | undefined
  await env.withSecurityRulesDisabled(async (c) => { data = (await getDoc(doc(c.firestore(), path))).data() })
  return data
}

const claimRef = (uid: string, requestId: string, workerId: string) => doc(ctx(uid).firestore(), `requests/${requestId}/claims/${workerId}`)

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-helpnear',
    firestore: { rules: readFileSync('firebase/firestore.rules', 'utf8') },
  })
})
afterAll(async () => { await env.cleanup() })
beforeEach(seed)

describe('auth and roles', () => {
  it('denies unauthenticated reads of requests', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'requests/r1')))
  })
  it('lets a new user create a client profile with accepted terms', async () => {
    const db = env.authenticatedContext('new1', { email: 'new1@example.com' }).firestore()
    await assertSucceeds(setDoc(doc(db, 'users/new1'), {
      role: 'client', displayName: 'N', email: 'new1@example.com', termsVersion: 'v1', privacyVersion: 'v1',
      termsAcceptedAt: serverTimestamp(), over18: true, status: 'active', createdAt: serverTimestamp(),
    }))
  })
  it('blocks signing up as admin or with a stale terms version', async () => {
    const db = env.authenticatedContext('new2', { email: 'new2@example.com' }).firestore()
    const base = { displayName: 'N', email: 'new2@example.com', privacyVersion: 'v1', termsAcceptedAt: serverTimestamp(), over18: true, status: 'active', createdAt: serverTimestamp() }
    await assertFails(setDoc(doc(db, 'users/new2'), { ...base, role: 'admin', termsVersion: 'v1' }))
    await assertFails(setDoc(doc(db, 'users/new2'), { ...base, role: 'client', termsVersion: 'old' }))
  })
  it('blocks role escalation and editing another user', async () => {
    const db = ctx('client1').firestore()
    await assertFails(updateDoc(doc(db, 'users/client1'), { role: 'worker' }))
    await assertFails(updateDoc(doc(db, 'users/client1'), { status: 'active' }))
    await assertFails(updateDoc(doc(db, 'users/client2'), { displayName: 'hacked' }))
  })
  it('blocks self-granting admin', async () => {
    const db = ctx('client1').firestore()
    await assertFails(setDoc(doc(db, 'admins/client1'), { createdAt: serverTimestamp() }))
  })
  it('blocks forging worker rating fields', async () => {
    const db = ctx('w1').firestore()
    await assertFails(updateDoc(doc(db, 'workers/w1'), { ratingAverage: 5 }))
    await assertFails(updateDoc(doc(db, 'workers/w1'), { ratingCount: 99 }))
  })
})

describe('requests', () => {
  it('lets a verified client post (request + contact + cooldown in one batch)', async () => {
    await assertSucceeds(post('client1'))
  })
  it('blocks unverified email, suspended users, and workers from posting', async () => {
    await assertFails(post('client1', false))
    await assertFails(post('badclient'))
    await assertFails(post('w1'))
  })
  it('blocks a second post inside the cooldown', async () => {
    await assertSucceeds(post('client1'))
    await assertFails(post('client1'))
  })
  it('blocks out-of-bound fields (claimsCount, promoted, expiry, disabled category, worker count)', async () => {
    await assertFails(post('client1', true, { claimsCount: 5 }))
    await assertFails(post('client1', true, { promoted: true }))
    await assertFails(post('client1', true, { expiresAt: hours(24 * 30) }))
    await assertFails(post('client1', true, { categoryId: 'nope', matchKey: `nope|${CELL}` }))
    await assertFails(post('client1', true, { workersNeeded: 0 }))
    await assertFails(post('client1', true, { workersNeeded: 11 }))
    await assertFails(post('client1', true, { workersNeeded: 6 })) // config cap is 5 in this test
  })
  it('blocks a bad ZIP, a wrong match key and a service switched off in that state', async () => {
    await assertFails(post('client1', true, { zip: '' }))
    await assertFails(post('client1', true, { zip: '7700' }))
    await assertFails(post('client1', true, { matchKey: 'cleaning|other' }))
    await assertFails(post('client1', true, { state: 'NY' })) // cleaning is disabled in NY
  })
  it('lets a client post 2 different kinds of workers in one batch, up to 5, and no more', async () => {
    await assertSucceeds(postGroup('client1', [`${GID}-0`, `${GID}-1`]))
  })
  it('blocks a 6th position, a request id that does not belong to the group, and a group id that differs from the cooldown record', async () => {
    await assertFails(post('client1', true, {}, { id: `${GID}-5` }))
    await assertFails(post('client1', true, {}, { id: 'someOtherId123456789' }))
    await assertFails(post('client1', true, {}, { rateGroup: 'Zzzzzzzzzz9999999999' }))
    await assertFails(post('client1', true, { groupId: 'short' }))
    await assertFails(post('client1', true, { groupSize: 6 }))
  })
  it('lets the owner stop taking workers, even when filled; others cannot', async () => {
    await assertSucceeds(updateDoc(doc(ctx('client1').firestore(), 'requests/r1'), { status: 'closed' }))
    await assertSucceeds(updateDoc(doc(ctx('client1').firestore(), 'requests/r3'), { status: 'closed' }))
    await assertFails(updateDoc(doc(ctx('client2').firestore(), 'requests/r1'), { status: 'closed' }))
  })
})

describe('private contact', () => {
  it('is readable by the owner only until a worker accepts', async () => {
    await assertSucceeds(getDoc(doc(ctx('client1').firestore(), 'requests/r1/private/contact')))
    await assertFails(getDoc(doc(ctx('client2').firestore(), 'requests/r1/private/contact')))
    await assertFails(getDoc(doc(ctx('w1').firestore(), 'requests/r1/private/contact')))
  })
  it('is revealed to a worker after accepting, and hidden again after a cancellation', async () => {
    await assertSucceeds(accept('w1'))
    await assertSucceeds(getDoc(doc(ctx('w1').firestore(), 'requests/r1/private/contact')))
    await assertFails(getDoc(doc(ctx('w2').firestore(), 'requests/r1/private/contact')))
    await assertSucceeds(cancel('w1', 'r1', 'w1'))
    await assertFails(getDoc(doc(ctx('w1').firestore(), 'requests/r1/private/contact')))
  })
})

describe('accepting', () => {
  it('allows a matching worker to accept with a price', async () => {
    await assertSucceeds(accept('w1'))
  })
  it('marks the request filled once the client\'s worker count is reached', async () => {
    await assertSucceeds(accept('w1'))
    await assertSucceeds(accept('w2'))
    const snap = await readDoc('requests/r1')
    if (snap?.status !== 'filled' || snap.claimsCount !== 2) throw new Error(`expected filled with 2 workers, got ${JSON.stringify(snap)}`)
  })
  it('blocks accepting twice and accepting above the client\'s worker count', async () => {
    await assertSucceeds(accept('w1'))
    await assertFails(accept('w1'))
    await assertSucceeds(accept('w2'))
    await assertFails(accept('w3'))
  })
  it('blocks a wrong service, a worker whose area does not cover the request, and clients', async () => {
    await assertFails(accept('wpaint'))
    await assertFails(accept('wfar'))
    await assertFails(accept('client2'))
  })
  it('blocks zero or huge prices, a pre-agreed price, and a counter bump without a claim document', async () => {
    await assertFails(accept('w1', 'r1', { quotedCents: 0 }))
    await assertFails(accept('w1', 'r1', { quotedCents: 99_999_999 }))
    await assertFails(accept('w1', 'r1', { clientAgreed: true }))
    await assertFails(updateDoc(doc(ctx('w1').firestore(), 'requests/r1'), { claimsCount: 1, status: 'open' }))
  })
  it('blocks a claim that lies about the client or the title', async () => {
    await assertFails(accept('w1', 'r1', { clientId: 'client2' }))
    await assertFails(accept('w1', 'r1', { title: 'Something else' }))
  })
})

describe('job lifecycle (agree, done, confirm, cancel)', () => {
  it('lets the client agree, but not the worker or a stranger', async () => {
    await assertFails(updateDoc(claimRef('w1', 'r2', 'w1'), { clientAgreed: true }))
    await assertFails(updateDoc(claimRef('client2', 'r2', 'w1'), { clientAgreed: true }))
    await assertSucceeds(updateDoc(claimRef('client1', 'r2', 'w1'), { clientAgreed: true }))
  })
  it('lets the worker change the price only while it is not agreed, or together with resetting the agreement', async () => {
    await assertSucceeds(updateDoc(claimRef('w1', 'r2', 'w1'), { quotedCents: 15000, note: 'Three hours of work' }))
    await assertFails(updateDoc(claimRef('w1', 'r3', 'w1'), { quotedCents: 99000 }))
    await assertSucceeds(updateDoc(claimRef('w1', 'r3', 'w1'), { quotedCents: 99000, clientAgreed: false }))
  })
  it('lets the worker mark done only after the client agreed', async () => {
    const done = { status: 'done', finalCents: 12500, doneAt: serverTimestamp() }
    await assertFails(updateDoc(claimRef('w1', 'r2', 'w1'), done))
    await assertSucceeds(updateDoc(claimRef('w1', 'r3', 'w1'), done))
  })
  it('blocks the client from marking done and the worker from confirming', async () => {
    await assertFails(updateDoc(claimRef('client1', 'r3', 'w1'), { status: 'done', finalCents: 1, doneAt: serverTimestamp() }))
    await assertFails(updateDoc(claimRef('w1', 'r4', 'w1'), { status: 'confirmed', confirmedAt: serverTimestamp() }))
  })
  it('lets only the owner confirm a done job, or send it back', async () => {
    await assertFails(updateDoc(claimRef('client2', 'r4', 'w1'), { status: 'confirmed', confirmedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(claimRef('client1', 'r4', 'w1'), { status: 'confirmed', confirmedAt: serverTimestamp() }))
    await assertFails(updateDoc(claimRef('client1', 'r4', 'w1'), { status: 'accepted', reopenCount: 1 })) // confirmed jobs are final
  })
  it('does not let a confirmed job be reopened, re-marked or cancelled', async () => {
    await assertFails(updateDoc(claimRef('client1', 'r5', 'w1'), { status: 'accepted', reopenCount: 1 }))
    await assertFails(updateDoc(claimRef('w1', 'r5', 'w1'), { status: 'done', finalCents: 1, doneAt: serverTimestamp() }))
    await assertFails(cancel('w1', 'r5', 'w1'))
  })
  it('lets the client send a done job back to accepted, counting it', async () => {
    await assertSucceeds(updateDoc(claimRef('client1', 'r4', 'w1'), { status: 'accepted', reopenCount: 1 }))
    await assertFails(updateDoc(claimRef('client1', 'r4', 'w1'), { status: 'accepted' })) // the counter must go up
    await assertFails(updateDoc(claimRef('w1', 'r4', 'w1'), { status: 'accepted', reopenCount: 1 })) // only the client
  })
  it('lets either side cancel an accepted job and frees the worker slot', async () => {
    await assertSucceeds(cancel('w1', 'r3', 'w1'))
    await assertSucceeds(cancel('client1', 'r2', 'w1'))
    const r3 = await readDoc('requests/r3')
    if (r3?.status !== 'open' || r3.claimsCount !== 0) throw new Error(`slot not freed: ${JSON.stringify(r3)}`)
  })
  it('blocks cancelling without freeing the slot, or by a stranger', async () => {
    const db = ctx('w1').firestore()
    await assertFails(updateDoc(doc(db, 'requests/r2/claims/w1'), { status: 'cancelled', cancelledBy: 'worker', cancelReason: 'Plans changed', cancelledAt: serverTimestamp(), cancelWasLate: false }))
    await assertFails(cancel('client2', 'r2', 'w1'))
    await assertFails(cancel('w2', 'r2', 'w1'))
  })
  it('blocks forging the counter for a worker whose claim is not cancelled', async () => {
    await assertFails(updateDoc(doc(ctx('client1').firestore(), 'requests/r2'), { claimsCount: 0, status: 'open', lastWorkerId: 'w1' }))
  })
})

describe('fair use: late cancellations, disputes, freezes, strikes', () => {
  const lateCancel = (uid: string, requestId: string, flag: boolean) => {
    const db = ctx(uid).firestore()
    return runTransaction(db, async (tx) => {
      const rref = doc(db, `requests/${requestId}`)
      const r = (await tx.get(rref)).data() as { claimsCount: number; status: string }
      tx.update(doc(db, `requests/${requestId}/claims/w1`), { status: 'cancelled', cancelledBy: uid === 'w1' ? 'worker' : 'client', cancelReason: 'Plans changed', cancelledAt: serverTimestamp(), cancelWasLate: flag })
      tx.update(rref, { claimsCount: r.claimsCount - 1, status: r.status === 'filled' ? 'open' : r.status, lastWorkerId: 'w1' })
    })
  }
  it('records honestly whether a cancellation came after the price was agreed', async () => {
    await assertFails(lateCancel('w1', 'r3', false)) // r3 is agreed, so it must be flagged late
    await assertSucceeds(lateCancel('w1', 'r3', true))
    await assertFails(lateCancel('client1', 'r2', true)) // r2 is not agreed yet, so it cannot be flagged late
    await assertSucceeds(lateCancel('client1', 'r2', false))
  })

  it('turns the second "not done yet" into a dispute (threshold from config)', async () => {
    const dispute = { status: 'disputed', reopenCount: 2, disputeBy: 'client', disputeReason: 'Said not done twice', disputedAt: serverTimestamp() }
    await assertFails(updateDoc(claimRef('client1', 'r6', 'w1'), { status: 'accepted', reopenCount: 2 })) // at the limit it must be a dispute
    await assertFails(updateDoc(claimRef('client1', 'r4', 'w1'), dispute)) // first time on r4: too early to dispute this way
    await assertSucceeds(updateDoc(claimRef('client1', 'r6', 'w1'), dispute))
  })
  it('lets either side raise a dispute once the price is agreed, but nobody else', async () => {
    const d = (by: string) => ({ status: 'disputed', disputeBy: by, disputeReason: 'Client stopped answering', disputedAt: serverTimestamp() })
    await assertFails(updateDoc(claimRef('w1', 'r2', 'w1'), d('worker'))) // not agreed yet: cancel instead
    await assertSucceeds(updateDoc(claimRef('w1', 'r3', 'w1'), d('worker')))
    await assertSucceeds(updateDoc(claimRef('client1', 'r4', 'w1'), d('client')))
    await assertFails(updateDoc(claimRef('client2', 'r3', 'w1'), d('client')))
    await assertFails(updateDoc(claimRef('w1', 'r3', 'w1'), d('client'))) // cannot pretend to be the other side
  })

  it('blocks a frozen client from posting and a frozen worker from accepting; lifts when the time passes', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await updateDoc(doc(c.firestore(), 'users/client1'), { frozenUntil: hours(24) })
      await updateDoc(doc(c.firestore(), 'users/w1'), { frozenUntil: hours(24) })
    })
    await assertFails(post('client1'))
    await assertFails(accept('w1'))
    await assertSucceeds(accept('w2')) // others are not affected
    await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), 'users/client1'), { frozenUntil: Timestamp.fromMillis(Date.now() - 1000) }) })
    await assertSucceeds(post('client1'))
  })
  it('blocks a suspended worker from accepting', async () => {
    await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), 'users/w1'), { status: 'suspended' }) })
    await assertFails(accept('w1'))
  })
  it('lets only an admin freeze or flag a user; users cannot lift it themselves', async () => {
    const freeze = { frozenUntil: hours(48), frozenReason: 'Too many late cancellations' }
    await assertSucceeds(updateDoc(doc(ctx('admin1').firestore(), 'users/client1'), freeze))
    await assertFails(updateDoc(doc(ctx('client2').firestore(), 'users/client1'), freeze))
    await assertFails(updateDoc(doc(ctx('client1').firestore(), 'users/client1'), { frozenUntil: Timestamp.fromMillis(Date.now() - 1000) }))
    await assertSucceeds(updateDoc(doc(ctx('admin1').firestore(), 'users/client1'), { needsReview: true, reviewReason: 'x' }))
  })

  it('lets an admin write strikes and remove them; users only read their own', async () => {
    const strike = (userId: string, by = 'admin') => ({ userId, role: 'worker', type: 'warning', requestId: '', note: 'Rude message', createdAt: serverTimestamp(), by })
    await assertSucceeds(setDoc(doc(ctx('admin1').firestore(), 'strikes/s1'), strike('w1')))
    await assertFails(setDoc(doc(ctx('w1').firestore(), 'strikes/s2'), strike('w1'))) // not even about themselves
    await assertFails(setDoc(doc(ctx('admin1').firestore(), 'strikes/s3'), strike('w1', 'system'))) // only the worker service account is 'system'
    await assertSucceeds(getDocs(query(collection(ctx('w1').firestore(), 'strikes'), where('userId', '==', 'w1'))))
    await assertFails(getDocs(query(collection(ctx('w2').firestore(), 'strikes'), where('userId', '==', 'w1'))))
    await assertSucceeds(deleteDoc(doc(ctx('admin1').firestore(), 'strikes/s1')))
    await assertFails(deleteDoc(doc(ctx('w1').firestore(), 'strikes/s1')))
  })

  it('lets an admin decide a dispute (confirm, send back, cancel and free the slot) and nobody else', async () => {
    await assertSucceeds(updateDoc(claimRef('admin1', 'r7', 'w1'), { status: 'confirmed', finalCents: 12000, confirmedAt: serverTimestamp(), resolution: 'Photos show it was done' }))
    await assertFails(updateDoc(claimRef('admin1', 'r7', 'w1'), { status: 'accepted', resolution: 'Work resumes' })) // a confirmed job cannot be resolved again
    await seed()
    await assertSucceeds(updateDoc(claimRef('admin1', 'r7', 'w1'), { status: 'accepted', resolution: 'Work resumes' }))
    await seed()
    const db = ctx('admin1').firestore()
    await assertSucceeds(runTransaction(db, async (tx) => {
      const rref = doc(db, 'requests/r7')
      const r = (await tx.get(rref)).data() as { claimsCount: number; status: string }
      tx.update(doc(db, 'requests/r7/claims/w1'), { status: 'cancelled', cancelledBy: 'admin', cancelReason: 'Cancelled by an admin', cancelledAt: serverTimestamp(), resolution: 'Neither side answered' })
      tx.update(rref, { claimsCount: r.claimsCount - 1, status: r.status === 'filled' ? 'open' : r.status, lastWorkerId: 'w1' })
    }))
    await seed()
    await assertFails(updateDoc(claimRef('client1', 'r7', 'w1'), { status: 'confirmed', finalCents: 1, confirmedAt: serverTimestamp(), resolution: 'x' }))
    await assertFails(updateDoc(claimRef('w1', 'r7', 'w1'), { status: 'accepted', resolution: 'x' }))
  })
  it('lets an admin remove a confirmed job from earnings (fraud), and nobody else', async () => {
    await assertFails(updateDoc(claimRef('w1', 'r5', 'w1'), { status: 'voided', resolution: 'x' }))
    await assertSucceeds(updateDoc(claimRef('admin1', 'r5', 'w1'), { status: 'voided', resolution: 'Removed by an admin (fraud)' }))
  })
  it('lets an admin list disputes across all requests', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(ctx('admin1').firestore(), 'claims'), where('status', '==', 'disputed'))))
    await assertFails(getDocs(query(collectionGroup(ctx('w2').firestore(), 'claims'), where('status', '==', 'disputed'))))
  })
})

describe('dashboards (collection group queries)', () => {
  it('lets a worker list their own claims and a client list the claims on their requests', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(ctx('w1').firestore(), 'claims'), where('workerId', '==', 'w1'))))
    await assertSucceeds(getDocs(query(collectionGroup(ctx('client1').firestore(), 'claims'), where('clientId', '==', 'client1'))))
  })
  it('blocks listing somebody else\'s claims', async () => {
    await assertFails(getDocs(query(collectionGroup(ctx('w2').firestore(), 'claims'), where('workerId', '==', 'w1'))))
    await assertFails(getDocs(query(collectionGroup(ctx('client2').firestore(), 'claims'), where('clientId', '==', 'client1'))))
  })
})

describe('declined requests', () => {
  it('lets a worker keep their own declined list only', async () => {
    await assertSucceeds(setDoc(doc(ctx('w1').firestore(), 'workers/w1/private/declined'), { ids: ['r1'] }))
    await assertFails(setDoc(doc(ctx('w2').firestore(), 'workers/w1/private/declined'), { ids: ['r1'] }))
    await assertFails(getDoc(doc(ctx('w2').firestore(), 'workers/w1/private/declined')))
  })
})

describe('reviews', () => {
  const review = (uid: string, requestId: string, workerId: string, rating = 5) => {
    const db = ctx(uid).firestore()
    return setDoc(doc(db, `reviews/${requestId}_${workerId}`), {
      requestId, workerId, clientId: uid, rating, text: 'Great', createdAt: serverTimestamp(),
    })
  }
  it('lets the owner review a worker only after the job is confirmed, once', async () => {
    await assertFails(review('client1', 'r2', 'w1')) // accepted only
    await assertFails(review('client1', 'r4', 'w1')) // done, not confirmed
    await assertSucceeds(review('client1', 'r5', 'w1'))
    await assertFails(review('client1', 'r5', 'w1'))
  })
  it('blocks reviews from other clients, for non-workers on the job, and invalid ratings', async () => {
    await assertFails(review('client2', 'r5', 'w1'))
    await assertFails(review('client1', 'r5', 'w2'))
    await assertFails(review('client1', 'r5', 'w1', 9))
  })
})

describe('notifications', () => {
  const notif = (uid: string, toId: string, over: Record<string, unknown> = {}) => setDoc(doc(ctx(uid).firestore(), `notifications/${toId}/items/r2_w1_claim_abc123`), {
    type: 'claim', requestId: 'r2', fromId: uid, message: 'A worker accepted your request', read: false, createdAt: serverTimestamp(), ...over,
  })
  it('only the recipient reads them', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'notifications/client1/items/n1'), { read: false })
    })
    await assertSucceeds(getDoc(doc(ctx('client1').firestore(), 'notifications/client1/items/n1')))
    await assertFails(getDoc(doc(ctx('client2').firestore(), 'notifications/client1/items/n1')))
  })
  it('lets a worker notify the client of a request they accepted, nobody else', async () => {
    await assertSucceeds(notif('w1', 'client1'))
    await assertFails(notif('w2', 'client1')) // no claim on r2
    await assertFails(notif('w1', 'client2')) // not the request owner
    await assertFails(notif('w1', 'client1', { fromId: 'w2' }))
  })
  it('lets the client notify a worker on their request (not the other way round)', async () => {
    await assertSucceeds(notif('client1', 'w1', { type: 'agreed' }))
    await assertFails(notif('client2', 'w1', { type: 'agreed' }))
    await assertFails(notif('w1', 'w1', { type: 'agreed' }))
  })
})

describe('chat', () => {
  const thread = { requestId: 'r2', workerId: 'w1', clientId: 'client1', blockedBy: '', reported: false }
  it('is denied while chatEnabled is false', async () => {
    const db = ctx('client1').firestore()
    await assertFails(setDoc(doc(db, 'threads/r2_w1'), { ...thread, createdAt: serverTimestamp() }))
  })
  it('works for participants only when enabled, and respects blocking', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'config/app'), { signupOpen: true, maxWorkersPerRequest: 5, revealContactOnClaim: true, chatEnabled: true })
    })
    const client = ctx('client1').firestore()
    await assertSucceeds(setDoc(doc(client, 'threads/r2_w1'), { ...thread, createdAt: serverTimestamp() }))
    await assertSucceeds(setDoc(doc(client, 'threads/r2_w1/messages/m1'), { senderId: 'client1', text: 'Hi', createdAt: serverTimestamp() }))
    await assertFails(setDoc(doc(ctx('w2').firestore(), 'threads/r2_w1/messages/m2'), { senderId: 'w2', text: 'Hi', createdAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(client, 'threads/r2_w1'), { blockedBy: 'client1' }))
    await assertFails(setDoc(doc(client, 'threads/r2_w1/messages/m3'), { senderId: 'client1', text: 'Hi again', createdAt: serverTimestamp() }))
    await assertFails(getDoc(doc(ctx('admin1').firestore(), 'threads/r2_w1/messages/m1')))
  })
})

describe('push tokens', () => {
  it('lets a user store their own token only', async () => {
    const tok = { token: 'x'.repeat(40), createdAt: serverTimestamp() }
    await assertSucceeds(setDoc(doc(ctx('client1').firestore(), 'users/client1/tokens/t1'), tok))
    await assertFails(setDoc(doc(ctx('client2').firestore(), 'users/client1/tokens/t2'), tok))
    await assertFails(getDoc(doc(ctx('client2').firestore(), 'users/client1/tokens/t1')))
  })
})
