import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from './firebase'
import { cached, clearCache } from './cache'
import type { ReviewDoc } from './types'

/** Aggregates are computed on read (last 20 reviews) so they cannot be forged. Costs up to 20 reads per profile view. */
export function getWorkerReviews(workerId: string): Promise<{ items: ReviewDoc[]; average: number | null }> {
  // Kept 5 minutes in memory (cleared when a review is written), so reopening a profile or a request does not re-read the 20 reviews.
  return cached(`reviews:${workerId}`, 5 * 60_000, async () => {
    const snap = await getDocs(query(collection(db, 'reviews'), where('workerId', '==', workerId), orderBy('createdAt', 'desc'), limit(20)))
    const items = snap.docs.map((d) => ({ ...(d.data() as Omit<ReviewDoc, 'id'>), id: d.id }))
    const average = items.length ? items.reduce((a, r) => a + r.rating, 0) / items.length : null
    return { items, average }
  })
}

export async function createReview(args: { requestId: string; workerId: string; clientId: string; rating: number; text: string }) {
  await setDoc(doc(db, `reviews/${args.requestId}_${args.workerId}`), { ...args, createdAt: serverTimestamp() })
  clearCache(`reviews:${args.workerId}`) // the new review must show up right away
}

/** The review a client already left for this job, or null. */
export async function getMyReview(requestId: string, workerId: string): Promise<ReviewDoc | null> {
  const snap = await getDoc(doc(db, `reviews/${requestId}_${workerId}`))
  return snap.exists() ? ({ ...(snap.data() as Omit<ReviewDoc, 'id'>), id: snap.id }) : null
}

/** Rating of several workers at once (last 20 reviews each, read live so it cannot be forged). Workers without reviews get count 0. */
export async function getRatings(workerIds: string[]): Promise<Record<string, { average: number; count: number }>> {
  const unique = [...new Set(workerIds)]
  const out: Record<string, { average: number; count: number }> = {}
  await Promise.all(unique.map(async (id) => {
    try { const { items, average } = await getWorkerReviews(id); out[id] = { average: average ?? 0, count: items.length } } catch { out[id] = { average: 0, count: 0 } }
  }))
  return out
}
