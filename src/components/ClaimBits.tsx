import { useState, type FormEvent } from 'react'
import { btn, btnGhost, input } from './ui'

export function StatsGrid({ items }: { items: [string, string | number][] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([label, v]) => (
        <div key={label} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <p className="text-xs text-gray-600">{label}</p>
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
    <form onSubmit={submit} className="mt-2 flex w-full flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
      <label className="flex-1 text-sm">Why are you cancelling?
        <input required minLength={3} maxLength={200} className={`${input} mt-1`} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button className={btn} disabled={busy}>{busy ? 'Cancelling...' : 'Confirm cancel'}</button>
      <button type="button" className={btnGhost} onClick={onClose}>Keep job</button>
    </form>
  )
}
