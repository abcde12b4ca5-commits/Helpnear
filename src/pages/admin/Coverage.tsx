import { useState } from 'react'
import { collection, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { friendlyError } from '../../lib/errors'
import { ErrorBox, btn, card } from '../../components/ui'

const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ')
interface Row { state: string; workers: number; open: number }

/** Where workers are (by their base ZIP's state) and where open requests are waiting. 2 count queries per state, only on click. */
export default function Coverage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setBusy(true); setErr(null)
    try {
      const out = await Promise.all(STATES.map(async (state) => {
        const [w, r] = await Promise.all([
          getCountFromServer(query(collection(db, 'workers'), where('state', '==', state), where('isListed', '==', true))),
          getCountFromServer(query(collection(db, 'requests'), where('state', '==', state), where('status', '==', 'open'))),
        ])
        return { state, workers: w.data().count, open: r.data().count }
      }))
      setRows(out)
    } catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }

  const gaps = rows?.filter((r) => r.open > 0 && r.workers === 0) ?? []
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">Counts workers (listed) and open requests per state. Uses about 100 read operations each time you load it.</p>
      <button className={btn} onClick={load} disabled={busy}>{busy ? 'Loading...' : 'Load coverage'}</button>
      <ErrorBox message={err} />
      {gaps.length > 0 && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Open requests with no workers in: {gaps.map((g) => g.state).join(', ')}</p>}
      {rows && (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-left text-sm">
            <thead><tr><th className="p-1">State</th><th className="p-1">Workers</th><th className="p-1">Open requests</th></tr></thead>
            <tbody>{rows.filter((r) => r.workers > 0 || r.open > 0).map((r) => <tr key={r.state} className="border-t"><td className="p-1">{r.state}</td><td className="p-1">{r.workers}</td><td className="p-1">{r.open}</td></tr>)}</tbody>
          </table>
          {rows.every((r) => r.workers === 0 && r.open === 0) && <p className="p-2 text-sm text-gray-600">No workers or open requests yet.</p>}
        </div>
      )}
    </div>
  )
}
