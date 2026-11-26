import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
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
      <PageHeader title="My profile" sub="This is what clients see when you answer a request. You can change it any time." />
      <ErrorBox message={error} />
      {names ? <WorkerSummary uid={user.uid} worker={worker} names={names} /> : !error && <Spinner />}
    </div>
  )
}
