import { useEffect, useState } from 'react'
import { Timestamp, collection, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { card } from '../../components/ui'

export default function Dashboard() {
  const [c, setC] = useState<{ users: number; requests: number; reports: number } | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    const start = Timestamp.fromDate(new Date(new Date().setHours(0, 0, 0, 0)))
    Promise.all([
      getCountFromServer(query(collection(db, 'users'), where('createdAt', '>=', start))),
      getCountFromServer(query(collection(db, 'requests'), where('createdAt', '>=', start))),
      getCountFromServer(query(collection(db, 'reports'), where('status', '==', 'open'))),
    ]).then(([u, r, p]) => setC({ users: u.data().count, requests: r.data().count, reports: p.data().count })).catch(() => setErr(true))
  }, [])
  const items: [string, number | undefined][] = [['New users today', c?.users], ['New requests today', c?.requests], ['Open reports', c?.reports]]
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map(([label, v]) => <div key={label} className={card}><p className="text-xs text-gray-600">{label}</p><p className="text-2xl font-bold">{err ? '-' : v ?? '...'}</p></div>)}
      </div>
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        Spark free limits are hard daily caps (reads, writes, deletes); when exceeded the service stops until the next day. This page uses cheap count queries and cannot measure your reads. Check the Usage tab in the Firebase console daily during launch, and consider turning on maintenance mode (Settings) if you are close to a limit.
      </p>
    </div>
  )
}
