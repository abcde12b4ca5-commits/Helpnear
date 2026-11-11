import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { brand } from '../config/brand'
import { db } from '../lib/firebase'
import { useAuth } from '../lib/auth'
import { getCategories, getZones } from '../lib/catalog'
import { createReview, getWorkerReviews } from '../lib/reviews'
import { friendlyError } from '../lib/errors'
import ReportButton from '../components/ReportButton'
import { ErrorBox, Field, Spinner, btn, card, input } from '../components/ui'
import type { ReviewDoc, WorkerDoc } from '../lib/types'

export default function WorkerProfile() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const requestId = params.get('request')
  const { user, profile } = useAuth()
  const [worker, setWorker] = useState<WorkerDoc | null | undefined>(undefined)
  const [names, setNames] = useState<{ cats: Record<string, string>; zones: Record<string, string> }>({ cats: {}, zones: {} })
  const [reviews, setReviews] = useState<{ items: ReviewDoc[]; average: number | null } | null>(null)
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    getDoc(doc(db, `workers/${id}`)).then((s) => setWorker(s.exists() ? (s.data() as WorkerDoc) : null)).catch((e) => { setError(friendlyError(e)); setWorker(null) })
    getWorkerReviews(id).then(setReviews).catch(() => setReviews({ items: [], average: null }))
    Promise.all([getCategories(), getZones()]).then(([c, z]) => setNames({
      cats: Object.fromEntries(c.map((x) => [x.id, x.name])), zones: Object.fromEntries(z.map((x) => [x.id, x.name])),
    })).catch(() => undefined)
  }, [id])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user || !requestId) return
    setError(null)
    try {
      await createReview({ requestId, workerId: id, clientId: user.uid, rating, text: text.trim() })
      setDone(true); setReviews(await getWorkerReviews(id))
    } catch (err) { setError(friendlyError(err)) }
  }

  if (worker === undefined) return <Spinner />
  if (!worker) return <p className="text-sm text-gray-700">Profile not found.</p>
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{worker.displayName}</h1>
      <p className="text-sm text-gray-700">
        {reviews?.average != null ? `Rating ${reviews.average.toFixed(1)} from ${reviews.items.length} recent review(s)` : 'No reviews yet'}
      </p>
      {worker.bio && <p className="whitespace-pre-line text-sm">{worker.bio}</p>}
      <p className="text-sm">Services: {worker.categories.map((c) => names.cats[c] ?? c).join(', ')}</p>
      <p className="text-sm">Areas: {worker.zones.map((z) => names.zones[z] ?? z).join(', ')}</p>
      {(worker.licenseNote || worker.insuranceNote) && (
        <div className={`${card} text-sm`}>
          {worker.licenseNote && <p>License: {worker.licenseNote}</p>}
          {worker.insuranceNote && <p>Insurance: {worker.insuranceNote}</p>}
          <p className="mt-1 text-xs text-gray-600">Self-reported, not verified by {brand.name}.</p>
        </div>
      )}
      <ReportButton targetType="worker" targetId={id} />
      {profile?.role === 'client' && requestId && !done && (
        <form onSubmit={submit} className={`${card} space-y-3`}>
          <h2 className="font-semibold">Leave a review</h2>
          <Field label="Rating" htmlFor="rating">
            <select id="rating" className={input} value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>)}
            </select>
          </Field>
          <Field label="Comment (optional)" htmlFor="rtext"><textarea id="rtext" maxLength={500} rows={3} className={input} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <ErrorBox message={error} />
          <button className={btn}>Submit review</button>
        </form>
      )}
      {done && <p className="text-sm text-emerald-800" role="status">Thanks for your review.</p>}
      <section aria-labelledby="rv">
        <h2 id="rv" className="font-semibold">Reviews</h2>
        <ul className="mt-2 space-y-2">
          {reviews?.items.map((r) => <li key={r.id} className={`${card} text-sm`}>{'\u2605'.repeat(r.rating)} {r.text}</li>)}
        </ul>
      </section>
    </div>
  )
}
