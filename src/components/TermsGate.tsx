import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../lib/auth'
import { getLegal } from '../lib/catalog'
import { friendlyError } from '../lib/errors'
import { ErrorBox, btn } from './ui'

/** When the admin publishes a new Terms version, signed-in users must accept it before continuing. */
export default function TermsGate({ children }: { children: ReactNode }) {
  const { user, profile, refresh } = useAuth()
  const [current, setCurrent] = useState<{ terms: string; privacy: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!profile) return
    Promise.all([getLegal('terms'), getLegal('privacy')])
      .then(([t, p]) => { if (t && p) setCurrent({ terms: t.version, privacy: p.version }) })
      .catch(() => undefined)
  }, [profile])

  if (!user || !profile || !current || profile.termsVersion === current.terms) return <>{children}</>

  async function accept() {
    if (!user || !current) return
    try {
      await updateDoc(doc(db, `users/${user.uid}`), { termsVersion: current.terms, privacyVersion: current.privacy, termsAcceptedAt: serverTimestamp() })
      await refresh()
    } catch (e) { setError(friendlyError(e)) }
  }
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold">Updated Terms</h1>
      <p className="text-sm text-gray-800">We updated our <Link to="/legal/terms" target="_blank" className="underline">Terms</Link> and <Link to="/legal/privacy" target="_blank" className="underline">Privacy Policy</Link>. Please review and accept to continue.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> I accept the updated Terms and Privacy Policy.</label>
      <ErrorBox message={error} />
      <button className={btn} disabled={!checked} onClick={accept}>Continue</button>
    </div>
  )
}
