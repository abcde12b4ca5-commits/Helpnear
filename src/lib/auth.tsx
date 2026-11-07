import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
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
  signOut: () => Promise<void>
  resendVerification: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserDoc | null>(null)
  const [worker, setWorker] = useState<WorkerDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [verified, setVerified] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const load = useCallback(async (u: User | null) => {
    setUser(u)
    setVerified(!!u?.emailVerified)
    if (!u) { setProfile(null); setWorker(null); setIsAdmin(false); return }
    getDoc(doc(db, `admins/${u.uid}`)).then((a) => setIsAdmin(a.exists())).catch(() => setIsAdmin(false))
    const snap = await getDoc(doc(db, `users/${u.uid}`))
    const p = snap.exists() ? (snap.data() as UserDoc) : null
    setProfile(p)
    if (p?.role === 'worker') {
      const w = await getDoc(doc(db, `workers/${u.uid}`))
      setWorker(w.exists() ? (w.data() as WorkerDoc) : null)
    } else setWorker(null)
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
      await sendEmailVerification(cred.user)
      await load(cred.user)
    },
    async signIn(email, password) { await signInWithEmailAndPassword(auth, email, password) },
    async signOut() { await fbSignOut(auth) },
    async resendVerification() { if (auth.currentUser) await sendEmailVerification(auth.currentUser) },
    async refresh() {
      if (!auth.currentUser) return
      await auth.currentUser.reload()
      await auth.currentUser.getIdToken(true) // rules read email_verified from the token
      await load(auth.currentUser)
    },
  }), [user, profile, worker, loading, verified, isAdmin, load])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
