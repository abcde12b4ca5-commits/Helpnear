import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { brand } from '../config/brand'
import { useAuth } from '../lib/auth'
import { getAppConfig } from '../lib/catalog'
import { getUnreadCount } from '../lib/notifications'
import { friendlyError } from '../lib/errors'
import { btnGhost } from './ui'

function VerifyBanner() {
  const { user, verified, resendVerification, refresh } = useAuth()
  const [msg, setMsg] = useState('')
  if (!user || verified) return null
  const run = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); setMsg(ok) } catch (e) { setMsg(friendlyError(e)) }
  }
  return (
    <div className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900" role="status">
      Please verify your email to post or claim requests. We sent a link to {user.email}.{' '}
      <button className="font-semibold underline" onClick={() => run(resendVerification, 'Verification email sent.')}>Resend</button>{' '}
      <button className="font-semibold underline" onClick={() => run(refresh, 'Status refreshed.')}>I have verified</button>
      {msg && <span className="ml-2">{msg}</span>}
    </div>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, profile, isAdmin, signOut } = useAuth()
  const [maintenance, setMaintenance] = useState(false)
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (user && profile?.role === 'client') getUnreadCount(user.uid).then(setUnread).catch(() => undefined)
  }, [user, profile])
  useEffect(() => { getAppConfig().then((c) => setMaintenance(c.maintenanceMode)).catch(() => undefined) }, [])
  const link = ({ isActive }: { isActive: boolean }) => `px-2 py-1 text-sm ${isActive ? 'font-semibold text-emerald-800' : 'text-gray-700 hover:text-emerald-800'}`

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <a href="#main" className="sr-only focus:not-sr-only focus:p-2">Skip to content</a>
      <header className="border-b bg-white">
        <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-3" aria-label="Main">
          <Link to="/" className="mr-auto text-lg font-bold text-emerald-800">{brand.name}</Link>
          <a href="/services/" className="px-2 py-1 text-sm text-gray-700 hover:text-emerald-800">Services</a>
          <NavLink to="/how-it-works" className={link}>How it works</NavLink>
          {user && profile?.role === 'client' && (<>
            <NavLink to="/post" className={link}>Post a request</NavLink>
            <NavLink to="/my-requests" className={link}>My requests</NavLink>
            <NavLink to="/notifications" className={link}>Notifications{unread > 0 ? ` (${unread})` : ''}</NavLink>
          </>)}
          {user && profile?.role === 'worker' && (<>
            <NavLink to="/feed" className={link}>Requests</NavLink>
            <NavLink to="/claims" className={link}>My claims</NavLink>
            <NavLink to="/onboarding" className={link}>Profile</NavLink>
          </>)}
          {isAdmin && <NavLink to="/admin" className={link}>Admin</NavLink>}
          {user
            ? <button className={btnGhost} onClick={() => signOut()}>Sign out</button>
            : (<><NavLink to="/login" className={link}>Sign in</NavLink><NavLink to="/signup" className={link}>Sign up</NavLink></>)}
        </nav>
      </header>
      <VerifyBanner />
      {maintenance && <div className="bg-red-50 px-4 py-2 text-center text-sm text-red-900" role="alert">{brand.name} is in maintenance mode. Some actions may be unavailable.</div>}
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t bg-white px-4 py-6 text-center text-xs text-gray-600">
        <p className="font-medium">{brand.disclaimer}</p>
        <p className="mt-2 space-x-3">
          <Link to="/legal/terms" className="underline">Terms</Link>
          <Link to="/legal/privacy" className="underline">Privacy</Link>
          <Link to="/legal/guidelines" className="underline">Community Guidelines</Link>
          <Link to="/legal/disclaimer" className="underline">Disclaimer</Link>
        </p>
      </footer>
    </div>
  )
}
