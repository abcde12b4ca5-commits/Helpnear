import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import type { Role } from '../lib/types'
import { Spinner } from './ui'

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, profile, worker, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (!profile) return <p className="text-sm text-red-800" role="alert">Your profile could not be loaded. Please sign out and try again.</p>
  if (profile.status === 'suspended') return <p className="text-sm text-red-800" role="alert">Your account is suspended.</p>
  if (profile.role !== role) return <Navigate to="/" replace />
  if (role === 'worker' && !worker) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

export function RequireWorkerOnboarding({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (profile?.role !== 'worker') return <Navigate to="/" replace />
  return <>{children}</>
}
