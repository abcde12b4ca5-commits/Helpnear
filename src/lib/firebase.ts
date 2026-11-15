import { initializeApp } from 'firebase/app'
import { CustomProvider, initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getTurnstileToken } from './turnstile'

export const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
})

// Optional bot protection. Option A (recommended): Turnstile + our Worker mints App Check tokens (custom provider).
// Option B: reCAPTCHA v3. Neither is active unless its env vars are set. Enforce in the Firebase console only after testing.
export const WORKER_URL: string = (import.meta.env.VITE_WORKER_URL ?? '').replace(/\/$/, '')
const turnstileKey: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''
const recaptchaKey: string = import.meta.env.VITE_APPCHECK_SITE_KEY ?? ''
/** Starts App Check (bot protection) the first time something actually needs Firebase. It is safe to call many times.
 *  Why not at page load: every new visitor would load Turnstile and spend one Worker request (free plan: 100,000 a day), even if they only read
 *  the home page. Now a visitor reading public pages costs nothing; sign-in, sign-up, any signed-in session and any Firestore read start it first. */
let appCheckStarted = false
export function ensureAppCheck(): void {
  if (appCheckStarted) return
  appCheckStarted = true
  if (WORKER_URL && turnstileKey) {
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          const turnstileToken = await getTurnstileToken(turnstileKey)
          const res = await fetch(`${WORKER_URL}/appcheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ turnstileToken }) })
          if (!res.ok) throw new Error('App Check token request failed')
          return (await res.json()) as { token: string; expireTimeMillis: number }
        },
      }),
      isTokenAutoRefreshEnabled: true,
    })
  } else if (recaptchaKey) {
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(recaptchaKey), isTokenAutoRefreshEnabled: true })
  }
}

// initializeAuth without a popup resolver: the 90 KB firebaseapp.com auth iframe is no longer loaded on every page view.
// The resolver is passed to signInWithPopup only when someone actually signs in with Google (see auth.tsx).
export const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })
export const db = getFirestore(app)

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099')
  connectFirestoreEmulator(db, 'localhost', 8080)
}
