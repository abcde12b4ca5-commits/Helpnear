import { useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, type Timestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { friendlyError } from '../../lib/errors'
import { Empty, ErrorBox, Spinner, card } from '../../components/ui'

interface Entry { id: string; adminId: string; action: string; targetPath: string; createdAt: Timestamp | null }

export default function AuditLog() {
  const [rows, setRows] = useState<Entry[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    getDocs(query(collection(db, 'adminLog'), orderBy('createdAt', 'desc'), limit(30)))
      .then((s) => setRows(s.docs.map((d) => ({ ...(d.data() as Omit<Entry, 'id'>), id: d.id })))).catch((e) => { setErr(friendlyError(e)); setRows([]) })
  }, [])
  if (!rows) return <Spinner />
  return (
    <div className="space-y-2">
      <ErrorBox message={err} />
      {rows.length === 0 && <Empty>No admin actions yet.</Empty>}
      {rows.map((r) => <p key={r.id} className={`${card} text-sm`}>{r.createdAt?.toDate().toLocaleString()} &middot; <strong>{r.action}</strong> &middot; <code>{r.targetPath}</code> &middot; by <code>{r.adminId}</code></p>)}
    </div>
  )
}
