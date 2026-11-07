import { collection, doc, serverTimestamp, writeBatch, type WriteBatch } from 'firebase/firestore'
import { db } from './firebase'
import { clearCache } from './cache'

/** Every admin change is committed together with an audit-log entry (adminLog is append-only in the rules). */
export async function adminWrite(adminId: string, action: string, targetPath: string, apply: (b: WriteBatch) => void): Promise<void> {
  const b = writeBatch(db)
  apply(b)
  b.set(doc(collection(db, 'adminLog')), { adminId, action, targetPath, createdAt: serverTimestamp() })
  await b.commit()
  clearCache()
}

export function setUserSuspended(adminId: string, uid: string, role: 'client' | 'worker', suspended: boolean) {
  return adminWrite(adminId, suspended ? 'suspend-user' : 'unsuspend-user', `users/${uid}`, (b) => {
    b.update(doc(db, `users/${uid}`), { status: suspended ? 'suspended' : 'active' })
    if (role === 'worker') b.update(doc(db, `workers/${uid}`), { isListed: !suspended })
  })
}
