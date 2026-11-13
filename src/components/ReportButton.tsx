import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { createReport } from '../lib/reports'
import { friendlyError } from '../lib/errors'
import { btnGhost, input } from './ui'

export default function ReportButton({ targetType, targetId }: { targetType: 'request' | 'worker'; targetId: string }) {
  const { user, verified } = useAuth()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState('')
  if (!user || !verified) return null
  async function send() {
    if (!user) return
    try {
      await createReport({ reporterId: user.uid, targetType, targetId, reason: reason.trim() })
      setMsg('Report sent. Thank you.'); setOpen(false); setReason('')
    } catch (e) { setMsg(friendlyError(e)) }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button className="text-xs text-mu underline" onClick={() => setOpen(!open)}>Report</button>
      {open && (<>
        <input aria-label="Reason for report" className={`${input} w-56`} maxLength={500} placeholder="What is wrong?" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className={btnGhost} disabled={reason.trim().length < 3} onClick={send}>Send</button>
      </>)}
      {msg && <span className="text-xs text-mu" role="status">{msg}</span>}
    </span>
  )
}
