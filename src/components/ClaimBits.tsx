import { useEffect, useState, type FormEvent } from 'react'
import { getAppConfig } from '../lib/catalog'
import { getMyStrikes } from '../lib/requests'
import { btn, btnGhost, input } from './ui'

export function StatsGrid({ items }: { items: [string, string | number][] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([label, v]) => (
        <div key={label} className="rounded-2xl border-2 border-ln bg-sf p-3 shadow-sm">
          <p className="text-xs text-mu">{label}</p>
          <p className="text-xl font-bold">{v}</p>
        </div>
      ))}
    </div>
  )
}

/** Small inline form asking for a short reason before cancelling a job. */
export function CancelForm({ onCancel, onClose }: { onCancel: (reason: string) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try { await onCancel(reason.trim()) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="mt-2 flex w-full flex-wrap items-end gap-2 rounded-xl border-2 border-ln p-3">
      <label className="flex-1 text-sm">Why are you cancelling?
        <input required minLength={3} maxLength={200} className={`${input} mt-1`} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button className={btn} disabled={busy}>{busy ? 'Cancelling...' : 'Confirm cancel'}</button>
      <button type="button" className={btnGhost} onClick={onClose}>Keep job</button>
    </form>
  )
}

/** Small inline form asking for the reason before an admin is asked to review a job. */
export function DisputeForm({ onSubmit, onClose }: { onSubmit: (reason: string) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try { await onSubmit(reason.trim()) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="mt-2 w-full space-y-2 rounded-xl border-2 border-ln p-3">
      <label className="block text-sm">What went wrong? An admin will read this and decide.
        <textarea required minLength={5} maxLength={500} rows={3} className={`${input} mt-1`} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button className={btn} disabled={busy}>{busy ? 'Sending...' : 'Ask an admin to review'}</button>
        <button type="button" className={btnGhost} onClick={onClose}>Close</button>
      </div>
    </form>
  )
}

/** Shows the user their own recent strikes and what happens at the limit (numbers come from Admin > Settings). */
export function StrikeNotice({ uid, role }: { uid: string; role: 'client' | 'worker' }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    Promise.all([getMyStrikes(uid), getAppConfig()]).then(([strikes, cfg]) => {
      const since = Date.now() - cfg.penaltyWindowDays * 86_400_000
      const n = strikes.filter((x) => (x.createdAt?.toMillis() ?? 0) >= since && x.type !== 'warning').length
      if (!active || n === 0) return
      const limit = role === 'client' ? cfg.clientFreezeAt : cfg.workerFreezeAt
      setText(`You have ${n} strike${n === 1 ? '' : 's'} in the last ${cfg.penaltyWindowDays} days (late cancellations after a price was agreed, or no response). At ${limit}, your account is limited for ${cfg.freezeDays} days.`)
    }).catch(() => undefined)
    return () => { active = false }
  }, [uid, role])
  return text ? <p role="status" className="rounded-xl bg-warn-bg p-3 text-sm text-warn-tx">{text}</p> : null
}
