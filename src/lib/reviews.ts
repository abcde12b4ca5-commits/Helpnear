import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from './firebase'
import type { ReviewDoc } from './types'

/** Aggregates are computed on read (last 20 reviews) so they cannot be forged. Costs up to 20 reads per profile view. */
export async function getWorkerReviews(workerId: string): Promise<{ items: ReviewDoc[]; average: number | null }> {
  const snap = await getDocs(query(collection(db, 'reviews'), where('workerId', '==', workerId), orderBy('createdAt', 'desc'), limit(20)))
  const items = snap.docs.map((d) => ({ ...(d.data() as Omit<ReviewDoc, 'id'>), id: d.id }))
  const average = items.length ? items.reduce((a, r) => a + r.rating, 0) / items.length : null
  return { items, average }
}

export async function createReview(args: { requestId: string; workerId: string; clientId: string; rating: number; text: string }) {
  await setDoc(doc(db, `reviews/${args.requestId}_${args.workerId}`), { ...args, createdAt: serverTimestamp() })
}
