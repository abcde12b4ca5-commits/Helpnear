import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getCategories } from '../lib/catalog'
import { friendlyError } from '../lib/errors'
import WorkerSummary from '../components/WorkerSummary'
import { ErrorBox, Spinner } from '../components/ui'

export default function MyProfile() {
  const { user, worker } = useAuth()
  const [names, setNames] = useState<Record<string, string> | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getCategories().then((cs) => setNames(Object.fromEntries(cs.map((c) => [c.id, c.name])))).catch((e) => setError(friendlyError(e)))
  }, [])
  if (!user || !worker) return <Navigate to="/onboarding" replace />
  return (
    <div className="max-w-3xl space-y-6">
      <div><h1 className="text-4xl">My profile</h1><p className="mt-2 text-mu">This is what clients see when you answer a request. You can change it any time.</p></div>
      <ErrorBox message={error} />
      {names ? <WorkerSummary uid={user.uid} worker={worker} names={names} /> : !error && <Spinner />}
    </div>
  )
}
