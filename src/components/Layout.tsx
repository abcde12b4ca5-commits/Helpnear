import LogoMark from './LogoMark'
import { useScrollFx } from '../lib/useScrollFx'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { brand } from '../config/brand'
import { useAuth } from '../lib/auth'
import { ensureAppCheck } from '../lib/firebase'
import { getAppConfig } from '../lib/catalog'
import { getUnreadCount } from '../lib/notifications'
import { friendlyError } from '../lib/errors'
import { btnGhost } from './ui'
import { useRouteMeta } from '../lib/useRouteMeta'

function VerifyBanner() {
  const { user, verified, resendVerification, refresh } = useAuth()
  const [msg, setMsg] = useState('')
  if (!user || verified) return null
  const run = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); setMsg(ok) } catch (e) { setMsg(friendlyError(e)) }
  }
  return (
    <div className="bg-warn-bg px-4 py-2 pt-20 text-center text-sm text-warn-tx" role="status">
      Please verify your email to post or accept requests. We sent a link to {user.email}.{' '}
      <button className="font-semibold underline" onClick={() => run(resendVerification, 'Verification email sent.')}>Resend</button>{' '}
      <button className="font-semibold underline" onClick={() => run(refresh, 'Status refreshed.')}>I have verified</button>
      {msg && <span className="ml-2">{msg}</span>}
    </div>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, profile, isAdmin, signOut } = useAuth()
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  useRouteMeta()
  const [maintenance, setMaintenance] = useState(false)
  const [unread, setUnread] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const [menuPath, setMenuPath] = useState<string | null>(null)
  const menuOpen = menuPath === pathname // closes automatically when the route changes
  useEffect(() => {
    if (user && profile) getUnreadCount(user.uid).then(setUnread).catch(() => undefined)
  }, [user, profile])
  const [mountedAt] = useState(() => Date.now())
  // A signed-out visitor reading public pages (home, how it works, services, legal) does not need the maintenance flag, so they cost NO Firestore read.
  // It is loaded for signed-in users and on the sign-in / sign-up pages, and then reused from the browser cache for 5 minutes.
  const needsConfig = Boolean(user) || pathname === '/login' || pathname === '/signup'
  useEffect(() => { if (needsConfig) ensureAppCheck() }, [needsConfig]) // sign-in/up pages warm up bot protection while the person types
  useEffect(() => { if (needsConfig) getAppConfig().then((c) => setMaintenance(c.maintenanceMode)).catch(() => undefined) }, [needsConfig])
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => { setScrolled(window.scrollY > 20); ticking = false })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const link = ({ isActive }: { isActive: boolean }) => `hn-link${isActive ? ' active' : ''}`
  const mobileLink = ({ isActive }: { isActive: boolean }) => `block rounded-xl px-3 py-2 text-base font-semibold ${isActive ? 'bg-ye text-ink' : 'text-tx hover:bg-sf'}`
  const solid = scrolled || !isHome || menuOpen
  useScrollFx(pathname)

  const links = (cls: typeof link) => (<>
    {user && profile?.role === 'client' && (<>
      <NavLink to="/post" className={cls}>Post a request</NavLink>
      <NavLink to="/my-requests" className={cls}>My requests</NavLink>
    </>)}
    {user && profile?.role === 'worker' && (<>
      <NavLink to="/feed" className={cls}>Requests</NavLink>
      <NavLink to="/dashboard" className={cls}>My jobs</NavLink>
      <NavLink to="/profile" className={cls}>Profile</NavLink>
    </>)}
    {user && profile && <NavLink to="/notifications" className={cls}>Notifications{unread > 0 ? ` (${unread})` : ''}</NavLink>}
    {isAdmin && <NavLink to="/admin" className={cls}>Admin</NavLink>}
  </>)

  return (
    <div className="flex min-h-screen flex-col bg-bg text-tx">
      <a href="#main" className="sr-only focus:not-sr-only focus:p-2">Skip to content</a>
      <div id="hn-progress" aria-hidden="true" />
      <header className={`hn-nav${solid ? ' solid' : ''}`}>
        {!solid && <p className="hn-trust">Free to use · No platform fee on jobs · Workers and neighbors across the U.S.</p>}
        <nav className="hn-w flex h-16 items-center gap-2" aria-label="Main">
          <Link to="/" className="hn-logo" aria-label={`${brand.name} home`}><i aria-hidden="true"><LogoMark /></i>{brand.name}</Link>
          <div className="hidden items-center gap-1 md:flex">
            <a href="/services/" className="hn-link">Services</a>
            <NavLink to="/how-it-works" className={link}>How it works</NavLink>
            {links(link)}
            {user
              ? <><span className="hn-av mx-2" aria-hidden="true">{(profile?.displayName ?? user.email ?? '?').charAt(0).toUpperCase()}</span><button className={btnGhost} onClick={() => signOut()}>Sign out</button></>
              : (<>
                <NavLink to="/login" className={link}>Sign in</NavLink>
                <Link to="/signup" className="hn-link">Hire a worker</Link>
                <Link to="/signup?role=worker" className="hn-btn hn-y ml-2">Join as a worker</Link>
              </>)}
          </div>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-xl border border-bd bg-sf text-xl md:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuPath(menuOpen ? null : pathname)}
          >{menuOpen ? '✕' : '☰'}</button>
        </nav>
        {menuOpen && (
          <div id="mobile-menu" className="hn-w space-y-1 pb-4 md:hidden">
            <a href="/services/" className="block rounded-xl px-3 py-2 text-base font-semibold text-tx hover:bg-sf">Services</a>
            <NavLink to="/how-it-works" className={mobileLink}>How it works</NavLink>
            {links(mobileLink)}
            {user
              ? <button className={`${btnGhost} mt-2 w-full`} onClick={() => signOut()}>Sign out</button>
              : (<>
                <NavLink to="/login" className={mobileLink}>Sign in</NavLink>
                <Link to="/signup" className="block rounded-xl px-3 py-2 text-base font-semibold text-tx hover:bg-sf">Hire a worker</Link>
                <Link to="/signup?role=worker" className="hn-btn hn-y mt-2 w-full">Join as a worker</Link>
              </>)}
          </div>
        )}
      </header>
      <VerifyBanner />
      {profile?.frozenUntil && profile.frozenUntil.toMillis() > mountedAt && (
        <div className="bg-danger-bg px-4 py-2 pt-20 text-center text-sm text-danger-tx" role="alert">
          Your account is limited until {profile.frozenUntil.toDate().toLocaleDateString('en-US')}{profile.frozenReason ? `: ${profile.frozenReason}` : '.'} You cannot {profile.role === 'worker' ? 'accept new requests' : 'post new requests'} until then. Contact support if you think this is a mistake.
        </div>
      )}
      {maintenance && <div className="bg-danger-bg px-4 py-2 pt-20 text-center text-sm text-danger-tx" role="alert">{brand.name} is in maintenance mode. Some actions may be unavailable.</div>}
      {isHome
        ? <main id="main" className="w-full flex-1">{children}</main>
        : <main id="main" className={`mx-auto w-full flex-1 px-5 pb-10 pt-24 ${pathname.startsWith('/admin') || pathname === '/feed' || pathname === '/dashboard' ? 'max-w-6xl' : 'max-w-4xl'}`}>{children}</main>}
      <footer className="hn-foot">
        <div className="hn-w">
          <p className="hn-fname font-display text-xl font-extrabold">{brand.name}</p>
          <p>{brand.disclaimer} Licenses and insurance shown by workers are self-reported and not verified. Electrical, plumbing and HVAC aren’t offered because they require a license.</p>
          <p>
            {!user && <><Link to="/signup">Need a worker? Post a job</Link> · </>}<Link to="/legal/terms">Terms</Link> · <Link to="/legal/privacy">Privacy</Link> · <Link to="/legal/guidelines">Community Guidelines</Link> · <Link to="/legal/disclaimer">Disclaimer</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
