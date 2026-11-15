// INTEGRATION: the site's real data layer (src/lib/requests.ts, notifications.ts, ...) against the real security rules,
// running on the Firestore EMULATOR with a throw-away project ("demo-helpnear"). No production data is ever touched.
// Run:  npm run test:rules   (starts the emulator, needs Java)
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore'

// The data layer imports `db` from ./firebase. Point it at whichever signed-in user the test is acting as.
const state = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../src/lib/firebase', () => ({ get db() { return state.db }, auth: { currentUser: null }, app: {}, WORKER_URL: '' }))

import { clearCache } from '../../src/lib/cache'
import { cellsCovering, encodeGeohash, matchKeysFor } from '../../src/lib/geo'
import {
  acceptRequest, agreeClaim, cancelClaim, cancelRequest, confirmDone, createRequests, declineRequest, getClientStats, getContact, getDeclined,
  getMyRequests, getPostCooldownSeconds, getRequestClaims, getWorkerClaims, getWorkerStats, loadFeed, markDone, newFeedState, openDispute, reopenClaim,
  type NewRequestInput,
} from '../../src/lib/requests'
import { listNotifications } from '../../src/lib/notifications'
import type { ClaimDoc, WorkerDoc } from '../../src/lib/types'

let env: RulesTestEnvironment
const as = (uid: string, verified = true) => { state.db = env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: verified }).firestore() }
const raw = async <T>(path: string) => { let d: T | undefined; await env.withSecurityRulesDisabled(async (c) => { d = (await getDoc(doc(c.firestore(), path))).data() as T }); return d }

// Houston, TX
const LAT = 29.7604, LNG = -95.3698
const CELL = encodeGeohash(LAT, LNG)
const worker = (cats: string[], over: Partial<WorkerDoc> = {}) => ({
  displayName: 'Worker', bio: '', categories: cats, baseZip: '77002', city: 'Houston', state: 'TX', lat: LAT, lng: LNG, radiusMiles: 25,
  matchKeys: matchKeysFor(cats, cellsCovering(LAT, LNG, 25)), confirmedCategories: cats, licenseNote: '', insuranceNote: '',
  ratingCount: 0, ratingAverage: 0, isListed: true, createdAt: Timestamp.now(), ...over,
})
const workerDoc = (cats: string[], over: Partial<WorkerDoc> = {}) => worker(cats, over) as unknown as WorkerDoc

const input = (over: Partial<NewRequestInput> = {}, workersNeeded = 2): NewRequestInput => ({
  clientId: 'client1', zip: '77002', city: 'Houston', state: 'TX', lat: LAT, lng: LNG, cell: CELL, urgency: 'asap', budgetRange: '$100-$200',
  contact: { phone: '5551234567', email: '', preferredContactMethod: 'phone' },
  positions: [{ categoryId: 'cleaning', categoryName: 'Cleaning', workersNeeded, title: 'Deep clean', description: 'Two bedroom apartment deep clean' }],
  ...over,
})

async function seed() {
  clearCache() // the app caches config/categories for 10 minutes
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore()
    await setDoc(doc(db, 'legal/terms'), { version: 'v1' })
    await setDoc(doc(db, 'config/app'), { signupOpen: true, maxWorkersPerRequest: 5, requestExpiryHours: 72, disputeAfterReopens: 2, revealContactOnClaim: true, chatEnabled: false })
    await setDoc(doc(db, 'categories/cleaning'), { enabled: true, disabledStates: ['NY'] })
    await setDoc(doc(db, 'categories/painting'), { enabled: true, disabledStates: [] })
    for (const c1 of ['client1', 'client2']) await setDoc(doc(db, `users/${c1}`), { role: 'client', status: 'active', displayName: c1 })
    await setDoc(doc(db, 'users/badclient'), { role: 'client', status: 'suspended' })
    for (const w of ['w1', 'w2', 'w3']) { await setDoc(doc(db, `users/${w}`), { role: 'worker', status: 'active', displayName: w }); await setDoc(doc(db, `workers/${w}`), worker(['cleaning'])) }
    await setDoc(doc(db, 'users/wpaint'), { role: 'worker', status: 'active' }); await setDoc(doc(db, 'workers/wpaint'), worker(['painting']))
    await setDoc(doc(db, 'users/wfar'), { role: 'worker', status: 'active' }); await setDoc(doc(db, 'workers/wfar'), worker(['cleaning'], { matchKeys: ['cleaning|zzzz'], lat: 47.6, lng: -122.3 }))
  })
}

beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-helpnear', firestore: { rules: readFileSync('firebase/firestore.rules', 'utf8') } }) })
afterAll(async () => { await env.cleanup() })
beforeEach(seed)

const accept = (w: string, requestId: string, quotedCents = 12000, note = 'Two hours of work') => { as(w); return acceptRequest({ requestId, workerId: w, workerName: w, quotedCents, note }) }
const claimOf = async (requestId: string, w: string) => (await raw<ClaimDoc>(`requests/${requestId}/claims/${w}`))!

describe('posting a request (createRequests)', () => {
  it('writes the request, the private contact and the cooldown record, with the right matchKey', async () => {
    as('client1')
    const [id] = await createRequests(input())
    const req = await raw<Record<string, unknown>>(`requests/${id}`)
    expect(req).toMatchObject({ clientId: 'client1', status: 'open', claimsCount: 0, workersNeeded: 2, matchKey: `cleaning|${CELL}`, promoted: false, groupSize: 1 })
    expect(await raw(`requests/${id}/private/contact`)).toMatchObject({ phone: '5551234567' })
    expect(await raw('rate/client1')).toMatchObject({ groupId: id.split('-')[0] })
  })

  it('posts several positions as one group, ids groupId-0..n', async () => {
    as('client1')
    const ids = await createRequests(input({ positions: [
      { categoryId: 'cleaning', categoryName: 'Cleaning', workersNeeded: 1, title: 'Clean kitchen', description: 'Kitchen deep clean please' },
      { categoryId: 'painting', categoryName: 'Painting', workersNeeded: 2, title: 'Paint bedroom', description: 'Paint two bedroom walls' },
    ] }))
    expect(ids).toHaveLength(2)
    expect(ids.map((i) => i.split('-')[1])).toEqual(['0', '1'])
    expect(new Set(ids.map((i) => i.split('-')[0])).size).toBe(1)
    expect((await raw<{ groupSize: number }>(`requests/${ids[1]}`))?.groupSize).toBe(2)
  })

  it('enforces the 60-second cooldown and reports the wait time', async () => {
    as('client1')
    expect(await getPostCooldownSeconds('client1')).toBe(0)
    await createRequests(input())
    const wait = await getPostCooldownSeconds('client1')
    expect(wait).toBeGreaterThan(50); expect(wait).toBeLessThanOrEqual(60)
    await expect(createRequests(input())).rejects.toThrow()
  })

  it('rejects unverified e-mail, suspended users, workers, and a service switched off in that state', async () => {
    as('client1', false); await expect(createRequests(input())).rejects.toThrow()
    as('badclient'); await expect(createRequests(input({ clientId: 'badclient' }))).rejects.toThrow()
    as('w1'); await expect(createRequests(input({ clientId: 'w1' }))).rejects.toThrow()
    as('client2'); await expect(createRequests(input({ clientId: 'client2', state: 'NY' }))).rejects.toThrow() // cleaning is off in NY
  })

  it('rejects a post made in someone else\'s name', async () => {
    as('client2'); await expect(createRequests(input({ clientId: 'client1' }))).rejects.toThrow()
  })

  it('rejects a worker count above the admin limit, and a bad ZIP', async () => {
    as('client1'); await expect(createRequests(input({}, 6))).rejects.toThrow()
    await seed(); as('client1'); await expect(createRequests(input({ zip: '77' }))).rejects.toThrow()
  })

  it('lists my own requests, newest first', async () => {
    as('client1'); await createRequests(input())
    const page = await getMyRequests('client1', null)
    expect(page.items).toHaveLength(1)
    expect(page.done).toBe(true)
    as('client2'); expect((await getMyRequests('client2', null)).items).toHaveLength(0)
  })
})

describe('the worker feed (matching)', () => {
  it('shows a matching open request to a worker whose service and area cover it', async () => {
    as('client1'); const [id] = await createRequests(input())
    as('w1'); const w = workerDoc(['cleaning'])
    const feed = await loadFeed(w, newFeedState(w))
    expect(feed.items.map((r) => r.id)).toContain(id)
  })

  it('does not show it for the wrong service', async () => {
    as('client1'); await createRequests(input())
    as('wpaint'); const w = workerDoc(['painting'])
    expect((await loadFeed(w, newFeedState(w))).items).toHaveLength(0)
  })

  it('does not show a request that is outside the worker\'s exact radius (cell filter is only coarse)', async () => {
    as('client1'); await createRequests(input({ lat: LAT + 0.45, lng: LNG })) // about 31 miles north but the cell can still be inside a 25 mile circle
    as('w1')
    const w = workerDoc(['cleaning'], { radiusMiles: 10, matchKeys: matchKeysFor(['cleaning'], cellsCovering(LAT, LNG, 25)) })
    expect((await loadFeed(w, newFeedState(w))).items).toHaveLength(0)
  })

  it('hides filled requests', async () => {
    as('client1'); const [id] = await createRequests(input({}, 1))
    await accept('w1', id)
    as('w2'); const w = workerDoc(['cleaning'])
    expect((await loadFeed(w, newFeedState(w))).items).toHaveLength(0)
  })

  it('lets a worker decline (hide) a request, persisted per worker', async () => {
    as('w1')
    expect(await getDeclined('w1')).toEqual([])
    expect(await declineRequest('w1', [], 'abc')).toEqual(['abc'])
    expect(await getDeclined('w1')).toEqual(['abc'])
    as('w2'); expect(await getDeclined('w2')).toEqual([])
  })

  it('a worker cannot read the feed of a client-only account (clients have no worker profile)', async () => {
    as('client1'); await createRequests(input())
    as('client2'); const w = workerDoc(['cleaning'])
    await expect(loadFeed(w, newFeedState(w))).rejects.toThrow()
  })
})

describe('full job lifecycle (accept, agree, done, confirm)', () => {
  it('goes all the way and counts in earnings, with notifications to the other side each step', async () => {
    as('client1'); const [id] = await createRequests(input({}, 1))

    await accept('w1', id, 15000)
    expect(await raw(`requests/${id}`)).toMatchObject({ status: 'filled', claimsCount: 1 })
    expect(await claimOf(id, 'w1')).toMatchObject({ status: 'accepted', clientAgreed: false, quotedCents: 15000, clientId: 'client1', title: 'Deep clean' })

    as('client1'); const [c1] = await getRequestClaims(id)
    await agreeClaim(c1)
    expect((await claimOf(id, 'w1')).clientAgreed).toBe(true)

    as('w1'); await markDone(await claimOf(id, 'w1'), 14500)
    expect(await claimOf(id, 'w1')).toMatchObject({ status: 'done', finalCents: 14500 })

    as('client1'); await confirmDone(await claimOf(id, 'w1'))
    expect(await claimOf(id, 'w1')).toMatchObject({ status: 'confirmed', finalCents: 14500 })

    as('w1'); expect(await getWorkerStats('w1')).toMatchObject({ completed: 1, totalCents: 14500, active: 0, waitingConfirmation: 0 })
    as('client1'); expect(await getClientStats('client1')).toMatchObject({ completed: 1, totalCents: 14500, requests: 1 })

    as('client1'); const toClient = await listNotifications('client1')
    expect(toClient.map((n) => n.type)).toEqual(expect.arrayContaining(['claim', 'done']))
    as('w1'); const toWorker = await listNotifications('w1')
    expect(toWorker.map((n) => n.type)).toEqual(expect.arrayContaining(['agreed', 'confirmed']))
  })

  it('lists a worker\'s jobs by status', async () => {
    as('client1'); const [id] = await createRequests(input({}, 2))
    await accept('w1', id)
    as('w1')
    expect((await getWorkerClaims('w1', 'accepted', null)).items).toHaveLength(1)
    expect((await getWorkerClaims('w1', 'confirmed', null)).items).toHaveLength(0)
    expect((await getWorkerClaims('w1', null, null)).items).toHaveLength(1)
  })

  it('the worker cannot mark done before the client agreed', async () => {
    as('client1'); const [id] = await createRequests(input({}, 1))
    await accept('w1', id); as('w1')
    await expect(markDone(await claimOf(id, 'w1'), 12000)).rejects.toThrow()
  })

  it('a client cannot confirm a job that is not done, and a stranger cannot confirm anything', async () => {
    as('client1'); const [id] = await createRequests(input({}, 1))
    await accept('w1', id)
    as('client1'); await expect(confirmDone(await claimOf(id, 'w1'))).rejects.toThrow()
    as('client1'); await agreeClaim(await claimOf(id, 'w1'))
    as('w1'); await markDone(await claimOf(id, 'w1'), 12000)
    as('client2'); await expect(confirmDone(await claimOf(id, 'w1'))).rejects.toThrow()
  })

  it('only the request owner can agree to a price', async () => {
    as('client1'); const [id] = await createRequests(input({}, 1))
    await accept('w1', id)
    as('client2'); await expect(agreeClaim(await claimOf(id, 'w1'))).rejects.toThrow()
    as('w1'); await expect(agreeClaim(await claimOf(id, 'w1'))).rejects.toThrow()
  })
})

describe('accepting rules (as seen through the app code)', () => {
  it('stops at the number of workers the client asked for, and refuses a second accept by the same worker', async () => {
    as('client1'); const [id] = await createRequests(input({}, 2))
    await accept('w1', id); await accept('w2', id)
    expect(await raw(`requests/${id}`)).toMatchObject({ status: 'filled', claimsCount: 2 })
    await expect(accept('w3', id)).rejects.toThrow(/already has all the workers|no longer open/)
    await expect(accept('w1', id)).rejects.toThrow()
  })

  it('refuses the wrong service, a worker from far away, and a client', async () => {
    as('client1'); const [id] = await createRequests(input({}, 2))
    await expect(accept('wpaint', id)).rejects.toThrow()
    await expect(accept('wfar', id)).rejects.toThrow()
    await expect(accept('client2', id)).rejects.toThrow()
  })

  it('refuses a missing request with a readable message', async () => {
    await expect(accept('w1', 'doesNotExist123456789-0')).rejects.toThrow()
  })

  it('hides the client\'s contact details until a worker accepts', async () => {
    as('client1'); const [id] = await createRequests(input({}, 2))
    as('w1'); await expect(getContact(id)).rejects.toThrow()
    await accept('w1', id)
    as('w1'); expect((await getContact(id)).phone).toBe('5551234567')
    as('w2'); await expect(getContact(id)).rejects.toThrow()
    as('client1'); expect((await getContact(id)).phone).toBe('5551234567')
  })
})

describe('cancelling and fair use', () => {
  it('a worker cancelling before agreement frees the slot and is not a "late" cancel', async () => {
    as('client1'); const [id] = await createRequests(input({}, 1))
    await accept('w1', id)
    as('w1'); await cancelClaim(await claimOf(id, 'w1'), 'worker', 'Plans changed')
    expect(await raw(`requests/${id}`)).toMatchObject({ status: 'open', claimsCount: 0 })
    expect(await claimOf(id, 'w1')).toMatchObject({ status: 'cancelled', cancelledBy: 'worker', cancelWasLate: false })
    as('w1'); await expect(getContact(id)).rejects.toThrow() // contact hidden again
  })

  it('cancelling AFTER the client agreed is marked late (the scheduled worker turns it into a strike)', async () => {
    as('client1'); const [id] = await createRequests(input({}, 1))
    await accept('w1', id)
    as('client1'); await agreeClaim(await claimOf(id, 'w1'))
    as('w1'); await cancelClaim(await claimOf(id, 'w1'), 'worker', 'Sorry')
    expect((await claimOf(id, 'w1')).cancelWasLate).toBe(true)
  })

  it('after a cancel, another worker can take the freed slot', async () => {
    as('client1'); const [id] = await createRequests(input({}, 1))
    await accept('w1', id)
    as('client1'); await cancelClaim(await claimOf(id, 'w1'), 'client', 'Changed my mind')
    await accept('w2', id)
    expect(await raw(`requests/${id}`)).toMatchObject({ status: 'filled', claimsCount: 1 })
  })

  it('a done or confirmed job can no longer be cancelled', async () => {
    as('client1'); const [id] = await createRequests(input({}, 1))
    await accept('w1', id)
    as('client1'); await agreeClaim(await claimOf(id, 'w1'))
    as('w1'); await markDone(await claimOf(id, 'w1'), 12000)
    as('client1'); await expect(cancelClaim(await claimOf(id, 'w1'), 'client', 'nope')).rejects.toThrow(/can no longer be cancelled/)
  })

  it('cancelling a whole request releases every accepted worker and closes it', async () => {
    as('client1'); const [id] = await createRequests(input({}, 2))
    await accept('w1', id); await accept('w2', id)
    as('client1'); await cancelRequest(id, await getRequestClaims(id), 'No longer needed')
    expect((await claimOf(id, 'w1')).status).toBe('cancelled')
    expect((await claimOf(id, 'w2')).status).toBe('cancelled')
    expect(await raw(`requests/${id}`)).toMatchObject({ status: 'closed', claimsCount: 0 })
  })

  it('"not done yet" sends the job back; the 2nd time it becomes a dispute for an admin', async () => {
    as('client1'); const [id] = await createRequests(input({}, 1))
    await accept('w1', id)
    as('client1'); await agreeClaim(await claimOf(id, 'w1'))
    as('w1'); await markDone(await claimOf(id, 'w1'), 12000)
    as('client1'); expect(await reopenClaim(await claimOf(id, 'w1'))).toBe('reopened')
    expect(await claimOf(id, 'w1')).toMatchObject({ status: 'accepted', reopenCount: 1 })
    as('w1'); await markDone(await claimOf(id, 'w1'), 12000)
    as('client1'); expect(await reopenClaim(await claimOf(id, 'w1'))).toBe('disputed')
    expect(await claimOf(id, 'w1')).toMatchObject({ status: 'disputed', reopenCount: 2 })
  })

  it('either side can ask an admin to review a job in disagreement', async () => {
    as('client1'); const [id] = await createRequests(input({}, 1))
    await accept('w1', id)
    as('client1'); await agreeClaim(await claimOf(id, 'w1'))
    as('w1'); await markDone(await claimOf(id, 'w1'), 12000)
    as('w1'); await openDispute(await claimOf(id, 'w1'), 'worker', 'Client will not confirm')
    expect(await claimOf(id, 'w1')).toMatchObject({ status: 'disputed', disputeBy: 'worker' })
  })
})

describe('privacy between users', () => {
  it('one client cannot read another client\'s requests or contact', async () => {
    as('client1'); const [id] = await createRequests(input())
    as('client2')
    await expect(getContact(id)).rejects.toThrow()
    expect((await getMyRequests('client2', null)).items).toHaveLength(0)
    await expect(getMyRequests('client1', null)).rejects.toThrow() // asking for client1's list while signed in as client2
  })

  it('a worker cannot see another worker\'s dashboard numbers', async () => {
    as('w2'); await expect(getWorkerClaims('w1', null, null)).rejects.toThrow()
  })
})
