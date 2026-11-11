import { collection, doc, getCountFromServer, getDocs, limit, orderBy, query, updateDoc, where } from 'firebase/firestore'
import { db } from './firebase'
import type { NotificationDoc } from './types'

/** Count query: about 1 read per 1000 matches. Called once per page load, no listeners. */
export async function getUnreadCount(uid: string): Promise<number> {
  const snap = await getCountFromServer(query(collection(db, `notifications/${uid}/items`), where('read', '==', false)))
  return snap.data().count
}

export async function listNotifications(uid: string): Promise<NotificationDoc[]> {
  const snap = await getDocs(query(collection(db, `notifications/${uid}/items`), orderBy('createdAt', 'desc'), limit(20)))
  return snap.docs.map((d) => ({ ...(d.data() as Omit<NotificationDoc, 'id'>), id: d.id }))
}

export async function markRead(uid: string, id: string) {
  await updateDoc(doc(db, `notifications/${uid}/items/${id}`), { read: true })
}
