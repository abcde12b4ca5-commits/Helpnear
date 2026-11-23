import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db, ensureAppCheck } from './firebase'
import { getAppConfig, getLegal } from './catalog'
import type { Role, UserDoc, WorkerDoc } from './types'

interface AuthState {
  user: User | null
  profile: UserDoc | null
  worker: WorkerDoc | null
  loading: boolean
  verified: boolean
  isAdmin: boolean
  signUp: (args: { email: string; password: string; displayName: string; role: Role }) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  /** Google sign-up: role and consent come from the signup form. Signs in instead if a profile already exists. */
  signUpWithGoogle: (args: { role: Role; displayName: string }) => Promise<Role>
  /** Google sign-in for existing accounts only. */
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  resendVerification: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

const ADMIN_HINT_TTL = 15 * 60_000
function readAdminHint(uid: string): boolean | null {
  try {
    const raw = sessionStorage.getItem(`hn:isAdmin:${uid}`)
    if (!raw) return null
    const { at, v } = JSON.parse(raw) as { at: number; v: boolean }
    return Date.now() - at < ADMIN_HINT_TTL && at <= Date.now() + 60_000 ? v : null
  } catch { return null }
}
function writeAdminHint(uid: string, v: boolean) {
  try { sessionStorage.setItem(`hn:isAdmin:${uid}`, JSON.stringify({ at: Date.now(), v })) } catch { /* storage unavailable */ }
}

// Profile + worker docs are read on every page load; keep them for 10 minutes in this tab only (sessionStorage), so a reload costs no reads.
// Timestamps are turned back into real Timestamp objects. refresh() always bypasses this cache, so edits show up immediately.
const PROFILE_TTL = 10 * 60_000
const PROFILE_KEY = 'hn:profile:'
function reviveTs(_k: string, v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.seconds === 'number' && typeof o.nanoseconds === 'number') return new Timestamp(o.seconds, o.nanoseconds)
  }
  return v
}
function readProfileCache(uid: string): { p: UserDoc; w: WorkerDoc | null } | null {
  try {
    const raw = sessionStorage.getItem(PROFILE_KEY + uid)
    if (!raw) return null
    const { at, p, w } = JSON.parse(raw, reviveTs) as { at: number; p: UserDoc; w: WorkerDoc | null }
    return Date.now() - at < PROFILE_TTL && at <= Date.now() + 60_000 && p ? { p, w: w ?? null } : null
  } catch { return null }
}
function writeProfileCache(uid: string, p: UserDoc, w: WorkerDoc | null) {
  try { sessionStorage.setItem(PROFILE_KEY + uid, JSON.stringify({ at: Date.now(), p, w })) } catch { /* storage unavailable: just no cache */ }
}
function clearProfileCache() {
  try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(PROFILE_KEY)) sessionStorage.removeItem(k) } catch { /* nothing to clear */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserDoc | null>(null)
  const [worker, setWorker] = useState<WorkerDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [verified, setVerified] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const load = useCallback(async (u: User | null, force = false) => {
    if (u) ensureAppCheck() // a signed-in session reads Firestore, so bot protection starts first
    setUser(u)
    setVerified(!!u) // e-mail verification is off: a signed-in account can post and accept straight away
    if (!u) { setProfile(null); setWorker(null); setIsAdmin(false); clearProfileCache(); return }
    // Only decides whether the Admin link is shown (the rules protect the data), so a 15 minute reuse saves one read on every page load.
    const known = readAdminHint(u.uid)
    if (known !== null) setIsAdmin(known)
    else getDoc(doc(db, `admins/${u.uid}`)).then((a) => { setIsAdmin(a.exists()); writeAdminHint(u.uid, a.exists()) }).catch(() => setIsAdmin(false))
    const hit = force ? null : readProfileCache(u.uid)
    if (hit) { setProfile(hit.p); setWorker(hit.w); return } // fresh copy from this tab: no Firestore reads
    const snap = await getDoc(doc(db, `users/${u.uid}`))
    const p = snap.exists() ? (snap.data() as UserDoc) : null
    setProfile(p)
    let w: WorkerDoc | null = null
    if (p?.role === 'worker') {
      const ws = await getDoc(doc(db, `workers/${u.uid}`))
      w = ws.exists() ? (ws.data() as WorkerDoc) : null
    }
    setWorker(w)
    // Cached only when the profile is complete (a worker still in onboarding has no worker doc yet, so that state is never cached)
    if (p && (p.role !== 'worker' || w)) writeProfileCache(u.uid, p, w)
  }, [])

  useEffect(() => onAuthStateChanged(auth, (u) => { load(u).catch(() => undefined).finally(() => setLoading(false)) }), [load])

  const value = useMemo<AuthState>(() => ({
    user, profile, worker, loading, verified, isAdmin,
    async signUp({ email, password, displayName, role }) {
      const config = await getAppConfig()
      if (!config.signupOpen) throw new Error('Sign-ups are currently closed.')
      const terms = await getLegal('terms')
      const privacy = await getLegal('privacy')
      if (!terms || !privacy) throw new Error('Legal documents are not available yet. Please try again later.')
      ensureAppCheck()
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      try {
        await setDoc(doc(db, `users/${cred.user.uid}`), {
          role, displayName, email: cred.user.email, termsVersion: terms.version, privacyVersion: privacy.version,
          termsAcceptedAt: serverTimestamp(), over18: true, status: 'active', createdAt: serverTimestamp(),
        })
      } catch (e) {
        await cred.user.delete().catch(() => undefined) // avoid an orphan account without a profile
        throw e
      }
      await load(cred.user)
    },
    async signIn(email, password) { ensureAppCheck(); await signInWithEmailAndPassword(auth, email, password) },
    async signUpWithGoogle({ role, displayName }) {
      const config = await getAppConfig()
      if (!config.signupOpen) throw new Error('Sign-ups are currently closed.')
      const terms = await getLegal('terms')
      const privacy = await getLegal('privacy')
      if (!terms || !privacy) throw new Error('Legal documents are not available yet. Please try again later.')
      ensureAppCheck()
      const cred = await signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver)
      const existing = await getDoc(doc(db, `users/${cred.user.uid}`))
      if (existing.exists()) { // already registered: just sign in
        await load(cred.user)
        return (existing.data() as UserDoc).role
      }
      const isNew = getAdditionalUserInfo(cred)?.isNewUser ?? false
      const email = cred.user.email
      const name = (displayName || cred.user.displayName || email?.split('@')[0] || 'User').slice(0, 60)
      try {
        await setDoc(doc(db, `users/${cred.user.uid}`), {
          role, displayName: name, email, termsVersion: terms.version, privacyVersion: privacy.version,
          termsAcceptedAt: serverTimestamp(), over18: true, status: 'active', createdAt: serverTimestamp(),
        })
      } catch (e) {
        if (isNew) await cred.user.delete().catch(() => undefined) // avoid an orphan account without a profile
        else await fbSignOut(auth).catch(() => undefined)
        throw e
      }
      await load(cred.user)
      return role
    },
    async signInWithGoogle() {
      ensureAppCheck()
      const cred = await signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver)
      const existing = await getDoc(doc(db, `users/${cred.user.uid}`))
      if (existing.exists()) { await load(cred.user); return }
      // No Helpnear profile: do not leave a half-created account behind.
      if (getAdditionalUserInfo(cred)?.isNewUser) await cred.user.delete().catch(() => undefined)
      else await fbSignOut(auth).catch(() => undefined)
      throw new Error('No Helpnear account found for this Google account. Please create an account first.')
    },
    async signOut() { await fbSignOut(auth) },
    async resendVerification() { if (auth.currentUser) await sendEmailVerification(auth.currentUser) },
    async refresh() {
      if (!auth.currentUser) return
      await auth.currentUser.reload()
      await auth.currentUser.getIdToken(true) // rules read email_verified from the token
      await load(auth.currentUser, true) // always fresh after an edit
    },
  }), [user, profile, worker, loading, verified, isAdmin, load])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
