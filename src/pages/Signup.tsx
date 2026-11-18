import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import { ErrorBox, Field, btn, input } from '../components/ui'
import GoogleButton, { OrDivider } from '../components/GoogleButton'
import type { Role } from '../lib/types'

export default function Signup() {
  const { signUp, signUpWithGoogle } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [role, setRole] = useState<Role>(params.get('role') === 'worker' ? 'worker' : 'client')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [over18, setOver18] = useState(false)
  const [terms, setTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!over18 || !terms) { setError('Please confirm you are 18 or older and accept the Terms and Privacy Policy.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setBusy(true); setError(null)
    try {
      await signUp({ email: email.trim(), password, displayName: displayName.trim(), role })
      nav(role === 'worker' ? '/onboarding' : '/post')
    } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }

  async function google() {
    if (!over18 || !terms) { setError('Please confirm you are 18 or older and accept the Terms and Privacy Policy.'); return }
    setBusy(true); setError(null)
    try {
      const finalRole = await signUpWithGoogle({ role, displayName: displayName.trim() })
      nav(finalRole === 'worker' ? '/onboarding' : '/post')
    } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }

  return (
    <div className="hn-auth">
    <div className="hn-orb" style={{ width: 380, height: 380, background: 'var(--ye)', opacity: .4, left: '6%', top: '2%' }} aria-hidden="true" />
    <div className="hn-orb" style={{ width: 280, height: 280, background: 'var(--ye)', opacity: .18, right: '8%', bottom: '2%', animationDelay: '-6s' }} aria-hidden="true" />
    <form onSubmit={submit} className="hn-glass hn-in">
      <div><h1 className="text-3xl">Create your account</h1><p className="mt-2 text-sm text-mu">Hire local help, or find nearby work.</p></div>
      <fieldset>
        <legend className="sr-only">I want to</legend>
        <div className="hn-seg">
          <label><input type="radio" name="role" className="sr-only" checked={role === 'worker'} onChange={() => setRole('worker')} />I’m a worker</label>
          <label><input type="radio" name="role" className="sr-only" checked={role === 'client'} onChange={() => setRole('client')} />I’m looking for a worker</label>
        </div>
      </fieldset>
      <Field label="Name" htmlFor="name" hint="First name and last initial is fine."><input id="name" required maxLength={60} className={input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></Field>
      <Field label="Email" htmlFor="email"><input id="email" type="email" autoComplete="email" required className={input} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters."><input id="password" type="password" autoComplete="new-password" required minLength={8} className={input} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={over18} onChange={(e) => setOver18(e.target.checked)} /> I am 18 years old or older.</label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <span>I accept the <Link to="/legal/terms" target="_blank" className="underline">Terms of Service</Link> and <Link to="/legal/privacy" target="_blank" className="underline">Privacy Policy</Link>.</span>
      </label>
      <ErrorBox message={error} />
      <button className={`${btn} w-full`} disabled={busy}>{busy ? 'Creating account...' : 'Create account'}</button>
      <OrDivider />
      <GoogleButton label="Sign up with Google" busy={busy} onClick={google} />
      <p className="text-sm text-mu">Already have an account? <Link to="/login" className="font-semibold text-tx underline">Sign in</Link></p>
    </form>
    </div>
  )
}
