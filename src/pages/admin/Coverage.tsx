import { useState } from 'react'
import { collection, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { friendlyError } from '../../lib/errors'
import { ErrorBox, btn, card } from '../../components/ui'

const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ')
interface Row { state: string; workers: number; open: number }
let lastRows: { at: number; rows: Row[] } | null = null // the last result stays for 10 minutes, so reopening the tab costs nothing; the button always reloads live

/** Where workers are (by their base ZIP's state) and where open requests are waiting. 2 count queries per state, only on click. */
export default function Coverage() {
  const [rows, setRows] = useState<Row[] | null>(() => (lastRows && Date.now() - lastRows.at < 10 * 60_000 ? lastRows.rows : null))
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
      lastRows = { at: Date.now(), rows: out }
      setRows(out)
    } catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }

  const gaps = rows?.filter((r) => r.open > 0 && r.workers === 0) ?? []
  return (
    <div className="space-y-4">
      <p className="text-sm text-mu">يعدّ العمّال (المعروضين) والطلبات المفتوحة في كل ولاية. يستهلك نحو 100 عملية قراءة في كل مرة تحمّله.</p>
      <button className={btn} onClick={load} disabled={busy}>{busy ? 'جارٍ التحميل...' : 'تحميل التغطية'}</button>
      <ErrorBox message={err} />
      {gaps.length > 0 && <p className="rounded-xl bg-warn-bg p-3 text-sm text-warn-tx">طلبات مفتوحة بلا عمّال في: {gaps.map((g) => g.state).join(', ')}</p>}
      {rows && (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-start text-sm">
            <thead><tr><th className="p-1">الولاية</th><th className="p-1">العمّال</th><th className="p-1">الطلبات المفتوحة</th></tr></thead>
            <tbody>{rows.filter((r) => r.workers > 0 || r.open > 0).map((r) => <tr key={r.state} className="border-t"><td className="p-1 ad-ltr">{r.state}</td><td className="p-1">{r.workers}</td><td className="p-1">{r.open}</td></tr>)}</tbody>
          </table>
          {rows.every((r) => r.workers === 0 && r.open === 0) && <p className="p-2 text-sm text-mu">لا يوجد عمّال أو طلبات مفتوحة بعد.</p>}
        </div>
      )}
    </div>
  )
}
