import { useEffect, useState } from 'react'
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { adminWrite, setUserSuspended } from '../../lib/admin'
import { escalate } from '../../lib/discipline'
import { friendlyError } from '../../lib/errors'
import { Empty, ErrorBox, Spinner, btnGhost, card } from '../../components/ui'
import type { RequestDoc } from '../../lib/types'

interface Report { id: string; reporterId: string; targetType: string; targetId: string; reason: string }

export default function Moderation() {
  const { user } = useAuth()
  const [reports, setReports] = useState<Report[] | null>(null)
  const [reqs, setReqs] = useState<RequestDoc[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = () => {
    getDocs(query(collection(db, 'reports'), where('status', '==', 'open'), orderBy('createdAt', 'desc'), limit(20)))
      .then((s) => setReports(s.docs.map((d) => ({ ...(d.data() as Omit<Report, 'id'>), id: d.id })))).catch((e) => { setErr(friendlyError(e)); setReports([]) })
    getDocs(query(collection(db, 'requests'), orderBy('createdAt', 'desc'), limit(20)))
      .then((s) => setReqs(s.docs.map((d) => ({ ...(d.data() as Omit<RequestDoc, 'id'>), id: d.id })))).catch((e) => setErr(friendlyError(e)))
  }
  useEffect(load, [])

  const run = async (fn: () => Promise<void>) => { try { setErr(null); await fn(); load() } catch (e) { setErr(friendlyError(e)) } }
  const setReport = (r: Report, status: string) => run(() => adminWrite(user!.uid, `report-${status}`, `reports/${r.id}`, (b) => b.update(doc(db, `reports/${r.id}`), { status })))
  const setRequest = (id: string, status: string) => run(() => adminWrite(user!.uid, `request-${status}`, `requests/${id}`, (b) => b.update(doc(db, `requests/${id}`), { status })))

  /** An upheld report: apply the warning, freeze, ban ladder to the owner of the request, or to the reported worker. */
  const escalateReport = (r: Report) => run(async () => {
    let userId = r.targetId, role: 'client' | 'worker' = 'worker'
    if (r.targetType === 'request') {
      const snap = await getDoc(doc(db, `requests/${r.targetId}`))
      if (!snap.exists()) throw new Error('That request no longer exists.')
      userId = (snap.data() as RequestDoc).clientId; role = 'client'
    }
    setMsg(await escalate(user!.uid, userId, role, `Report: ${r.reason}`.slice(0, 200)))
    await adminWrite(user!.uid, 'report-resolved', `reports/${r.id}`, (b) => b.update(doc(db, `reports/${r.id}`), { status: 'resolved' }))
  })

  if (!reports) return <Spinner />
  return (
    <div className="space-y-6">
      <ErrorBox message={err} />
      {msg && <p role="status" className="text-sm text-ac">{msg}</p>}
      <section>
        <h2 className="mb-2 font-semibold">Open reports</h2>
        {reports.length === 0 && <Empty>No open reports.</Empty>}
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className={`${card} space-y-2 text-sm`}>
              <p><strong>{r.targetType}</strong> <code>{r.targetId}</code> reported by <code>{r.reporterId}</code></p>
              <p className="text-tx">{r.reason}</p>
              <div className="flex flex-wrap gap-2">
                {r.targetType === 'request' && <button className={btnGhost} onClick={() => setRequest(r.targetId, 'removed').then(() => setReport(r, 'resolved'))}>Remove request and resolve</button>}
                {r.targetType === 'worker' && <button className={btnGhost} onClick={() => run(() => setUserSuspended(user!.uid, r.targetId, 'worker', true)).then(() => setReport(r, 'resolved'))}>Suspend worker and resolve</button>}
                {(r.targetType === 'request' || r.targetType === 'worker') && <button className={btnGhost} onClick={() => escalateReport(r)}>Report upheld: warn, freeze or ban the user</button>}
                <button className={btnGhost} onClick={() => setReport(r, 'resolved')}>Mark resolved</button>
                <button className={btnGhost} onClick={() => setReport(r, 'dismissed')}>Dismiss</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Latest requests</h2>
        <ul className="space-y-2">
          {reqs.map((r) => (
            <li key={r.id} className={`${card} flex flex-wrap items-center justify-between gap-2 text-sm`}>
              <span><strong>{r.title}</strong> ({r.categoryName}, {r.city}, {r.state}) <em>{r.status}</em></span>
              {r.status === 'removed' ? <button className={btnGhost} onClick={() => setRequest(r.id, 'open')}>Restore</button> : <button className={btnGhost} onClick={() => setRequest(r.id, 'removed')}>Remove</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
