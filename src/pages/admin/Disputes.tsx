import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { listDisputes, resolveDispute, type DisputeOutcome } from '../../lib/discipline'
import { dollarsToCents, formatCents } from '../../lib/money'
import { friendlyError } from '../../lib/errors'
import { Empty, ErrorBox, Spinner, btn, btnGhost, card, input } from '../../components/ui'
import type { ClaimDoc } from '../../lib/types'

const key = (c: ClaimDoc) => `${c.requestId}_${c.workerId}`

/** Jobs either side asked an admin to decide. Oldest first. */
export default function Disputes() {
  const { user } = useAuth()
  const [rows, setRows] = useState<ClaimDoc[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [strike, setStrike] = useState<Record<string, 'worker' | 'client' | ''>>({})

  const load = () => listDisputes().then(setRows).catch((e) => { setErr(friendlyError(e)); setRows([]) })
  useEffect(() => { void load() }, [])

  async function decide(c: ClaimDoc, outcome: DisputeOutcome) {
    if (!user) return
    const k = key(c)
    const note = (notes[k] ?? '').trim()
    if (note.length < 3) { setErr('Write a short note about your decision (3+ characters). Both sides see it.'); return }
    let finalCents: number | undefined
    if (outcome === 'confirm') {
      const cents = dollarsToCents(amounts[k] ?? ((c.finalCents ?? c.quotedCents) / 100).toString())
      if (cents == null) { setErr('Enter a valid final amount in dollars.'); return }
      finalCents = cents
    }
    try {
      setErr(null)
      await resolveDispute(user.uid, c, outcome, { finalCents, note, strikeTo: strike[k] || null })
      await load()
    } catch (e) { setErr(friendlyError(e)) }
  }

  if (!rows) return <Spinner />
  return (
    <div className="space-y-4">
      <p className="text-sm text-mu">Jobs where a side reported a problem, or where the client said "not done yet" too many times. Decide, write a short note, and optionally give a strike to the side at fault.</p>
      <ErrorBox message={err} />
      {rows.length === 0 && <Empty>No open disputes.</Empty>}
      <ul className="space-y-3">
        {rows.map((c) => {
          const k = key(c)
          return (
            <li key={k} className={`${card} space-y-2 text-sm`}>
              <p><strong>{c.title}</strong> ({c.categoryName})</p>
              <p>Worker: {c.workerName} <code className="text-xs">{c.workerId}</code> &middot; Client <code className="text-xs">{c.clientId}</code></p>
              <p>Quoted {formatCents(c.quotedCents)}{c.finalCents != null ? <> &middot; Worker's final {formatCents(c.finalCents)}</> : null} &middot; "Not done yet" {c.reopenCount ?? 0}x</p>
              <p className="text-tx">Raised by the <strong>{c.disputeBy}</strong>: {c.disputeReason}</p>
              <label className="block">Decision note (both sides see it)<input className={`${input} mt-1`} maxLength={300} value={notes[k] ?? ''} onChange={(e) => setNotes({ ...notes, [k]: e.target.value })} /></label>
              <label className="block">Final amount if you confirm (USD)<input className={`${input} mt-1`} inputMode="decimal" value={amounts[k] ?? ((c.finalCents ?? c.quotedCents) / 100).toString()} onChange={(e) => setAmounts({ ...amounts, [k]: e.target.value })} /></label>
              <label className="block">Strike for the side at fault
                <select className={`${input} mt-1`} value={strike[k] ?? ''} onChange={(e) => setStrike({ ...strike, [k]: e.target.value as 'worker' | 'client' | '' })}>
                  <option value="">No strike</option><option value="worker">The worker</option><option value="client">The client</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <button className={btn} onClick={() => decide(c, 'confirm')}>Confirm the job as done</button>
                <button className={btnGhost} onClick={() => decide(c, 'resume')}>Send back to work</button>
                <button className={btnGhost} onClick={() => decide(c, 'cancel')}>Cancel the job</button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
