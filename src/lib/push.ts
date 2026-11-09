import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { app, auth, db, WORKER_URL } from './firebase'

const VAPID: string = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? ''

export const pushConfigured = Boolean(WORKER_URL && VAPID && import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID)

export async function pushSupported(): Promise<boolean> {
  if (!pushConfigured || !('serviceWorker' in navigator) || !('Notification' in window)) return false
  const { isSupported } = await import('firebase/messaging')
  return isSupported()
}

async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Asks permission, registers the service worker, stores this device's FCM token under users/{uid}/tokens. */
export async function enablePush(uid: string): Promise<'enabled' | 'denied'> {
  if (await Notification.requestPermission() !== 'granted') return 'denied'
  const cfg = new URLSearchParams({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '', authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '', appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  })
  const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${cfg.toString()}`)
  const { getMessaging, getToken } = await import('firebase/messaging')
  const token = await getToken(getMessaging(app), { vapidKey: VAPID, serviceWorkerRegistration: registration })
  if (!token) return 'denied'
  await setDoc(doc(db, `users/${uid}/tokens/${await sha(token)}`), { token, createdAt: serverTimestamp() })
  return 'enabled'
}

export type PushEvent = 'accepted' | 'agreed' | 'done' | 'confirmed' | 'reopened' | 'cancelled_by_worker' | 'cancelled_by_client'

async function callWorker(path: string, body: Record<string, string>): Promise<void> {
  if (!WORKER_URL || !auth.currentUser) return
  try {
    const idToken = await auth.currentUser.getIdToken()
    await fetch(`${WORKER_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` }, body: JSON.stringify(body) })
  } catch { /* push is best-effort and never blocks the action */ }
}

/** Fire-and-forget: asks the edge worker to push the other side of a claim. Client-side events must name the worker. */
export function notifyEvent(event: PushEvent, requestId: string, workerId?: string): Promise<void> {
  return callWorker('/push', { requestId, event, ...(workerId ? { workerId } : {}) })
}

/** Fire-and-forget: asks the edge worker to push the workers whose area and service match a new request. */
export function notifyNewRequest(requestId: string): Promise<void> {
  return callWorker('/push-new', { requestId })
}
