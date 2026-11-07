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
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

let env: RulesTestEnvironment
const hours = (n: number) => Timestamp.fromMillis(Date.now() + n * 3600_000)

const ctx = (uid: string, verified = true) =>
  env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: verified })

const workerDoc = (categories: string[], zones: string[]) => ({
  displayName: 'W', bio: '', categories, zones, confirmedCategories: categories,
  licenseNote: '', insuranceNote: '', ratingCount: 0, ratingAverage: 0, isListed: true,
  createdAt: Timestamp.now(),
})

async function seed() {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore()
    await setDoc(doc(db, 'legal/terms'), { version: 'v1' })
    await setDoc(doc(db, 'config/app'), { signupOpen: true, maxClaimsPerRequest: 2, revealContactOnClaim: true })
    await setDoc(doc(db, 'categories/cleaning'), { enabled: true })
    await setDoc(doc(db, 'categories/painting'), { enabled: true })
    await setDoc(doc(db, 'zones/z1'), { enabled: true })
    await setDoc(doc(db, 'users/client1'), { role: 'client', status: 'active' })
    await setDoc(doc(db, 'users/client2'), { role: 'client', status: 'active' })
    await setDoc(doc(db, 'users/badclient'), { role: 'client', status: 'suspended' })
    for (const w of ['w1', 'w2', 'w3']) {
      await setDoc(doc(db, `users/${w}`), { role: 'worker', status: 'active' })
      await setDoc(doc(db, `workers/${w}`), workerDoc(['cleaning'], ['z1']))
    }
    await setDoc(doc(db, 'users/wpaint'), { role: 'worker', status: 'active' })
    await setDoc(doc(db, 'workers/wpaint'), workerDoc(['painting'], ['z1']))
    await setDoc(doc(db, 'admins/admin1'), { createdAt: Timestamp.now() })
    await setDoc(doc(db, 'config/app'), { signupOpen: true, maxClaimsPerRequest: 2, revealContactOnClaim: true, chatEnabled: false })
    await setDoc(doc(db, 'requests/r2'), {
      clientId: 'client1', categoryId: 'cleaning', categoryName: 'Cleaning', zoneId: 'z1', zoneName: 'Z1',
      zip: '', title: 'Second job', description: 'Another job here', urgency: 'asap', budgetRange: '',
      status: 'open', claimsCount: 1, matchKey: 'cleaning|z1', createdAt: Timestamp.now(), expiresAt: hours(48), promoted: false,
    })
    await setDoc(doc(db, 'requests/r2/claims/w1'), { workerId: 'w1', requestId: 'r2', workerName: 'W' })
    await setDoc(doc(db, 'requests/r1'), {
      clientId: 'client1', categoryId: 'cleaning', categoryName: 'Cleaning', zoneId: 'z1', zoneName: 'Z1',
      zip: '', title: 'Clean my house', description: 'Two bedroom apartment', urgency: 'asap', budgetRange: '',
      status: 'open', claimsCount: 0, matchKey: 'cleaning|z1', createdAt: Timestamp.now(), expiresAt: hours(48), promoted: false,
    })
    await setDoc(doc(db, 'requests/r1/private/contact'), { phone: '555', email: '', preferredContactMethod: 'phone' })
  })
}

const newRequest = (clientId: string, overrides: Record<string, unknown> = {}) => ({
  clientId, categoryId: 'cleaning', categoryName: 'Cleaning', zoneId: 'z1', zoneName: 'Z1', zip: '77002',
  title: 'Deep clean', description: 'Need a deep clean of 2 rooms', urgency: 'asap', budgetRange: '$100',
  status: 'open', claimsCount: 0, matchKey: 'cleaning|z1', createdAt: serverTimestamp(), expiresAt: hours(72),
  promoted: false, ...overrides,
})

async function post(uid: string, verified = true, overrides: Record<string, unknown> = {}) {
  const db = ctx(uid, verified).firestore()
  const b = writeBatch(db)
  b.set(doc(db, `rate/${uid}`), { lastPostAt: serverTimestamp() })
  b.set(doc(db, 'requests/new1'), newRequest(uid, overrides))
  b.set(doc(db, 'requests/new1/private/contact'), { phone: '555', email: '', preferredContactMethod: 'phone' })
  return b.commit()
}

async function claim(uid: string, requestId = 'r1') {
  const db = ctx(uid).firestore()
  return runTransaction(db, async (tx) => {
    const ref = doc(db, `requests/${requestId}`)
    const snap = await tx.get(ref)
    tx.update(ref, { claimsCount: (snap.data()?.claimsCount ?? 0) + 1 })
    tx.set(doc(db, `requests/${requestId}/claims/${uid}`), {
      workerId: uid, requestId, workerName: 'W', createdAt: serverTimestamp(),
    })
  })
}

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
  it('blocks out-of-bound fields (claimsCount, promoted, expiry, disabled category)', async () => {
    await assertFails(post('client1', true, { claimsCount: 5 }))
    await assertFails(post('client1', true, { promoted: true }))
    await assertFails(post('client1', true, { expiresAt: hours(24 * 30) }))
    await assertFails(post('client1', true, { categoryId: 'nope', matchKey: 'nope|z1' }))
  })
})

describe('private contact', () => {
  it('is readable by the owner only until a worker claims', async () => {
    await assertSucceeds(getDoc(doc(ctx('client1').firestore(), 'requests/r1/private/contact')))
    await assertFails(getDoc(doc(ctx('client2').firestore(), 'requests/r1/private/contact')))
    await assertFails(getDoc(doc(ctx('w1').firestore(), 'requests/r1/private/contact')))
  })
  it('is revealed to a worker after a successful claim', async () => {
    await assertSucceeds(claim('w1'))
    await assertSucceeds(getDoc(doc(ctx('w1').firestore(), 'requests/r1/private/contact')))
    await assertFails(getDoc(doc(ctx('w2').firestore(), 'requests/r1/private/contact')))
  })
})

describe('claims', () => {
  it('allows a matching worker to claim', async () => {
    await assertSucceeds(claim('w1'))
  })
  it('blocks claiming twice', async () => {
    await assertSucceeds(claim('w1'))
    await assertFails(claim('w1'))
  })
  it('blocks claims above the cap (cap = 2 in this test)', async () => {
    await assertSucceeds(claim('w1'))
    await assertSucceeds(claim('w2'))
    await assertFails(claim('w3'))
  })
  it('blocks a worker outside the category', async () => {
    await assertFails(claim('wpaint'))
  })
  it('blocks bumping the counter without a claim document', async () => {
    const db = ctx('w1').firestore()
    await assertFails(updateDoc(doc(db, 'requests/r1'), { claimsCount: 1 }))
  })
  it('blocks clients from claiming', async () => {
    await assertFails(claim('client2'))
  })
})

describe('reviews', () => {
  const review = (uid: string, requestId: string, workerId: string, rating = 5) => {
    const db = ctx(uid).firestore()
    return setDoc(doc(db, `reviews/${requestId}_${workerId}`), {
      requestId, workerId, clientId: uid, rating, text: 'Great', createdAt: serverTimestamp(),
    })
  }
  it('lets the owner review a worker who claimed the request, once', async () => {
    await assertSucceeds(review('client1', 'r2', 'w1'))
    await assertFails(review('client1', 'r2', 'w1'))
  })
  it('blocks reviews from other clients, for non-claimers, and invalid ratings', async () => {
    await assertFails(review('client2', 'r2', 'w1'))
    await assertFails(review('client1', 'r2', 'w2'))
    await assertFails(review('client1', 'r2', 'w1', 9))
  })
})

describe('notifications', () => {
  it('only the recipient reads them', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'notifications/client1/items/n1'), { read: false })
    })
    await assertSucceeds(getDoc(doc(ctx('client1').firestore(), 'notifications/client1/items/n1')))
    await assertFails(getDoc(doc(ctx('client2').firestore(), 'notifications/client1/items/n1')))
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
      await setDoc(doc(c.firestore(), 'config/app'), { signupOpen: true, maxClaimsPerRequest: 2, revealContactOnClaim: true, chatEnabled: true })
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
