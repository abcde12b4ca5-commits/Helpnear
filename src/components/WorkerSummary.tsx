import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRatings } from '../lib/reviews'
import { brand } from '../config/brand'
import { Pill, btn, btnGhost, card } from './ui'
import type { WorkerDoc } from '../lib/types'

// The worker's own profile card: used on the Profile page (full) and at the top of My jobs (compact).
export default function WorkerSummary({ uid, worker, names, compact = false }: { uid: string; worker: WorkerDoc; names: Record<string, string>; compact?: boolean }) {
  const [rating, setRating] = useState<{ average: number; count: number } | null>(null)
  useEffect(() => { getRatings([uid]).then((r) => setRating(r[uid] ?? null)).catch(() => undefined) }, [uid])
  const initial = (worker.displayName || '?').trim().charAt(0).toUpperCase()
  return (
    <section className={`${card} space-y-4 p-6`} aria-label="Your profile">
      <div className="flex flex-wrap items-center gap-4">
        <span className="hn-avatar" aria-hidden="true">{initial}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl">{worker.displayName}</h2>
          <p className="text-sm text-mu">
            {worker.workMode === 'cities' ? `Works in ${worker.cities?.length ?? 0} cit${worker.cities?.length === 1 ? 'y' : 'ies'}: ${(worker.cities ?? []).map((k) => k.split('|').reverse().join(', ')).join('; ')}` : `${worker.city}, ${worker.state} · travels up to ${worker.radiusMiles} miles`} ·{' '}
            {rating && rating.count > 0 ? `${rating.average.toFixed(1)} ★ (${rating.count} review${rating.count === 1 ? '' : 's'})` : 'no reviews yet'}
          </p>
        </div>
        <Link className={btn} to="/onboarding">Edit profile</Link>
      </div>
      <div>
        <p className="mb-2 text-sm text-mu">Services you chose ({worker.categories.length})</p>
        <ul className="flex flex-wrap gap-2">
          {worker.categories.map((id) => <li key={id}><Pill tone="y">{names[id] ?? id}</Pill></li>)}
        </ul>
      </div>
      {!compact && (<>
        <div>
          <p className="mb-1 text-sm text-mu">About you</p>
          <p className="text-sm">{worker.bio || 'You have not written anything yet. Add a short description so clients know what to expect.'}</p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-mu">License</dt><dd>{worker.licenseNote ? `${worker.licenseNote} (self-reported, not verified by ${brand.name})` : 'Not added'}</dd></div>
          <div><dt className="text-mu">Insurance</dt><dd>{worker.insuranceNote ? `${worker.insuranceNote} (self-reported, not verified by ${brand.name})` : 'Not added'}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Link className={btnGhost} to={`/worker/${uid}`}>See how clients see you</Link>
          <Link className={btnGhost} to="/feed">See requests for your services</Link>
        </div>
      </>)}
    </section>
  )
}
