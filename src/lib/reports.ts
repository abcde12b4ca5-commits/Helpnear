import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

export async function createReport(args: { reporterId: string; targetType: 'request' | 'worker' | 'message'; targetId: string; reason: string }) {
  await addDoc(collection(db, 'reports'), { ...args, status: 'open', createdAt: serverTimestamp() })
}
