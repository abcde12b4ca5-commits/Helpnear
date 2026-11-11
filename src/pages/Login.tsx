import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import { ErrorBox, Field, btn, input } from '../components/ui'
import GoogleButton, { OrDivider } from '../components/GoogleButton'

export default function Login() {
  const { signIn, signInWithGoogle } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await signIn(email.trim(), password); nav('/') } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }
  async function google() {
    setBusy(true); setError(null)
    try { await signInWithGoogle(); nav('/') } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <Field label="Email" htmlFor="email"><input id="email" type="email" autoComplete="email" required className={input} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Password" htmlFor="password"><input id="password" type="password" autoComplete="current-password" required className={input} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <ErrorBox message={error} />
      <button className={`${btn} w-full`} disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
      <OrDivider />
      <GoogleButton label="Sign in with Google" busy={busy} onClick={google} />
      <p className="text-sm text-gray-700">New here? <Link to="/signup" className="underline">Create an account</Link></p>
    </form>
  )
}
