import { collection, doc, getCountFromServer, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from './firebase'
import type { NotificationDoc, NotificationType } from './types'

/** Count query: about 1 read per 1000 matches. Called once per page load, no listeners. */
export async function getUnreadCount(uid: string): Promise<number> {
  const key = `hn:unread:${uid}`
  try { // reused for 2 minutes in this tab, so reloads do not pay for the count again
    const raw = sessionStorage.getItem(key)
    if (raw) { const { at, n } = JSON.parse(raw) as { at: number; n: number }; if (Date.now() - at < 120_000 && at <= Date.now() + 60_000) return n }
  } catch { /* no cache */ }
  const snap = await getCountFromServer(query(collection(db, `notifications/${uid}/items`), where('read', '==', false)))
  const n = snap.data().count
  try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), n })) } catch { /* no cache */ }
  return n
}

export async function listNotifications(uid: string): Promise<NotificationDoc[]> {
  const snap = await getDocs(query(collection(db, `notifications/${uid}/items`), orderBy('createdAt', 'desc'), limit(20)))
  return snap.docs.map((d) => ({ ...(d.data() as Omit<NotificationDoc, 'id'>), id: d.id }))
}

export async function markRead(uid: string, id: string) {
  await updateDoc(doc(db, `notifications/${uid}/items/${id}`), { read: true })
  try { sessionStorage.removeItem(`hn:unread:${uid}`) } catch { /* no cache */ } // the next count must be fresh
}

/**
 * In-app notification for the other side of a request. Best effort: it is written after the real change was committed,
 * so a failure here never undoes or blocks the change. Id = requestId_workerId_type_random (a repeat, e.g. after a
 * reopen, creates a new item instead of failing).
 */
export async function sendNotification(args: { toId: string; fromId: string; workerId: string; requestId: string; type: NotificationType; message: string }): Promise<void> {
  try {
    const suffix = Math.random().toString(36).slice(2, 8)
    await setDoc(doc(db, `notifications/${args.toId}/items/${args.requestId}_${args.workerId}_${args.type}_${suffix}`), {
      type: args.type, requestId: args.requestId, fromId: args.fromId, message: args.message.slice(0, 140), read: false, createdAt: serverTimestamp(),
    })
  } catch { /* notifications are best-effort */ }
}
