import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { acceptRequest, declineRequest, getDeclined, getWorkerClaims, loadFeed, newFeedState, type FeedState } from '../lib/requests'
import { haversineMiles } from '../lib/geo'
import { dollarsToCents } from '../lib/money'
import { friendlyError } from '../lib/errors'
import ReportButton from '../components/ReportButton'
import RequestCard from '../components/RequestCard'
import { Empty, ErrorBox, Field, Spinner, btn, btnGhost, input } from '../components/ui'
import type { RequestDoc } from '../lib/types'

export default function Feed() {
  const { user, worker, verified } = useAuth()
  const [items, setItems] = useState<RequestDoc[]>([])
  const [feed, setFeed] = useState<FeedState | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [declined, setDeclined] = useState<string[]>([])
  const [mine, setMine] = useState<Set<string>>(new Set())
  const [accepting, setAccepting] = useState<string | null>(null) // request whose accept form is open
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const fetchFirst = useCallback(async () => {
    if (!worker || !user) return null
    const [page, dec, claims] = await Promise.all([loadFeed(worker, newFeedState(worker)), getDeclined(user.uid), getWorkerClaims(user.uid, null, null)])
    return { page, dec, claims }
  }, [worker, user])
  const apply = useCallback((r: Awaited<ReturnType<typeof fetchFirst>>) => {
    if (!r) return
    setItems(r.page.items); setFeed(r.page.state); setDone(r.page.done); setDeclined(r.dec)
    setMine(new Set(r.claims.items.map((c) => c.requestId)))
  }, [])
  useEffect(() => {
    let active = true
    fetchFirst()
      .then((r) => { if (active) apply(r) })
      .catch((e) => { if (active) setError(friendlyError(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fetchFirst, apply])
  const start = () => {
    setLoading(true); setError(null)
    fetchFirst().then(apply).catch((e) => setError(friendlyError(e))).finally(() => setLoading(false))
  }

  async function more() {
    if (!worker || !feed) return
    setLoading(true); setError(null)
    try {
      const page = await loadFeed(worker, feed)
      setItems((prev) => { const seen = new Set(prev.map((x) => x.id)); return [...prev, ...page.items.filter((x) => !seen.has(x.id))] })
      setFeed(page.state); setDone(page.done)
    } catch (e) { setError(friendlyError(e)) } finally { setLoading(false) }
  }

  async function accept(e: FormEvent, r: RequestDoc) {
    e.preventDefault()
    if (!user || !worker) return
    const cents = dollarsToCents(price)
    if (cents == null || cents <= 0) { setError('Enter your price in dollars, for example 120 or 120.50.'); return }
    if (note.trim().length < 5) { setError('Describe in a sentence what the price includes.'); return }
    setBusy(true); setError(null)
    try {
      await acceptRequest({ requestId: r.id, workerId: user.uid, workerName: worker.displayName, quotedCents: cents, note: note.trim() })
      setMine((s) => new Set(s).add(r.id))
      setItems((list) => list.map((x) => (x.id === r.id ? { ...x, claimsCount: x.claimsCount + 1 } : x)))
      setAccepting(null); setPrice(''); setNote('')
    } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }

  async function decline(r: RequestDoc) {
    if (!user) return
    try { setDeclined(await declineRequest(user.uid, declined, r.id)) } catch (e) { setError(friendlyError(e)) }
  }

  const visible = items.filter((r) => !declined.includes(r.id))
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Requests for you</h1>
        <button className={btnGhost} onClick={start}>Refresh</button>
      </div>
      {!verified && <p className="text-sm text-amber-900">Verify your email to accept requests.</p>}
      <ErrorBox message={error} />
      {visible.length === 0 && !loading && <Empty>No open requests match your services and area right now. Check back soon.</Empty>}
      <ul className="space-y-3">
        {visible.map((r) => {
          const accepted = mine.has(r.id)
          const full = r.claimsCount >= (r.workersNeeded ?? 1)
          return (
            <RequestCard key={r.id} r={r} distanceMiles={worker ? haversineMiles(worker.lat, worker.lng, r.lat, r.lng) : undefined}>
              {accepted && <span className="text-sm font-medium text-emerald-800">You accepted this. Manage it in <Link to="/dashboard" className="underline">My jobs</Link>.</span>}
              {!accepted && accepting !== r.id && (<>
                <button className={btn} disabled={!verified || full} onClick={() => { setAccepting(r.id); setPrice(''); setNote(''); setError(null) }}>{full ? 'All workers found' : 'Accept'}</button>
                <button className={btnGhost} onClick={() => decline(r)}>Decline</button>
              </>)}
              <ReportButton targetType="request" targetId={r.id} />
              {!accepted && accepting === r.id && (
                <form onSubmit={(e) => accept(e, r)} className="mt-2 w-full space-y-3 rounded-md border border-gray-200 p-3">
                  <p className="text-xs text-gray-700">Your price and what it includes. The client sees this and agrees before you start. Your contact exchange happens after you accept.</p>
                  <Field label="Your price (USD)" htmlFor={`p-${r.id}`}><input id={`p-${r.id}`} required inputMode="decimal" className={input} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
                  <Field label="What the price includes" htmlFor={`n-${r.id}`}><textarea id={`n-${r.id}`} required minLength={5} maxLength={500} rows={3} className={input} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                  <div className="flex gap-2"><button className={btn} disabled={busy}>{busy ? 'Accepting...' : 'Accept this request'}</button><button type="button" className={btnGhost} onClick={() => setAccepting(null)}>Cancel</button></div>
                </form>
              )}
            </RequestCard>
          )
        })}
      </ul>
      {loading && <Spinner />}
      {!loading && !done && <button className={btnGhost} onClick={() => void more()}>Load more</button>}
    </div>
  )
}
