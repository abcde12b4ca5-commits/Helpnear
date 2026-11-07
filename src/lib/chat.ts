import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'
import { createReport } from './reports'
import type { MessageDoc, ThreadDoc } from './types'

export const threadId = (requestId: string, workerId: string) => `${requestId}_${workerId}`

export async function ensureThread(args: { requestId: string; workerId: string; clientId: string }): Promise<string> {
  const id = threadId(args.requestId, args.workerId)
  const ref = doc(db, `threads/${id}`)
  const snap = await getDoc(ref)
  if (!snap.exists()) await setDoc(ref, { ...args, blockedBy: '', reported: false, createdAt: serverTimestamp() })
  return id
}

export async function getThread(id: string): Promise<ThreadDoc | null> {
  const snap = await getDoc(doc(db, `threads/${id}`))
  return snap.exists() ? (snap.data() as ThreadDoc) : null
}

/** The only realtime listener in the app: one open thread, last 30 messages. Caller must unsubscribe. */
export function subscribeMessages(id: string, onData: (m: MessageDoc[]) => void, onError: (e: unknown) => void): Unsubscribe {
  const q = query(collection(db, `threads/${id}/messages`), orderBy('createdAt', 'desc'), limit(30))
  return onSnapshot(q, (snap) => onData(snap.docs.map((d) => ({ ...(d.data({ serverTimestamps: 'estimate' }) as Omit<MessageDoc, 'id'>), id: d.id })).reverse()), onError)
}

export async function sendMessage(id: string, senderId: string, text: string) {
  await setDoc(doc(collection(db, `threads/${id}/messages`)), { senderId, text, createdAt: serverTimestamp() })
}

export async function setBlocked(id: string, uid: string, blocked: boolean) {
  await updateDoc(doc(db, `threads/${id}`), { blockedBy: blocked ? uid : '' })
}

export async function reportThread(id: string, reporterId: string, reason: string) {
  await updateDoc(doc(db, `threads/${id}`), { reported: true }) // lets an admin read this thread
  await createReport({ reporterId, targetType: 'message', targetId: id, reason })
}
