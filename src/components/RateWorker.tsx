import { useEffect, useState } from 'react'
import { createReview, getMyReview } from '../lib/reviews'
import { friendlyError } from '../lib/errors'
import { ErrorBox, btn, input } from './ui'

// Shown on a confirmed job: the client rates the worker right there (1 to 5 stars + optional comment). One review per job.
export default function RateWorker({ requestId, workerId, clientId, workerName }: { requestId: string; workerId: string; clientId: string; workerName: string }) {
  const [state, setState] = useState<'loading' | 'form' | 'done'>('loading')
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getMyReview(requestId, workerId).then((r) => { if (r) { setRating(r.rating); setState('done') } else setState('form') }).catch(() => setState('form'))
  }, [requestId, workerId])
  if (state === 'loading') return null
  if (state === 'done') return <p className="mt-2 text-sm text-ac" role="status">You rated {workerName}: {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}. Thank you!</p>
  const submit = async () => {
    if (rating < 1) { setError('Tap the stars to choose a rating first.'); return }
    setBusy(true); setError(null)
    try { await createReview({ requestId, workerId, clientId, rating, text: text.trim() }); setState('done') } catch (e) { setError(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-ye p-3">
      <p className="text-sm font-semibold">How was {workerName}? Your rating helps other clients.</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className="text-3xl leading-none" style={{ color: n <= rating ? 'var(--ye)' : 'var(--mu)' }} onClick={() => setRating(n)}>★</button>
        ))}
      </div>
      <textarea aria-label="Comment (optional)" maxLength={500} rows={2} className={input} placeholder="Comment (optional)" value={text} onChange={(e) => setText(e.target.value)} />
      <ErrorBox message={error} />
      <button type="button" className={btn} disabled={busy} onClick={submit}>{busy ? 'Sending...' : 'Send rating'}</button>
    </div>
  )
}
