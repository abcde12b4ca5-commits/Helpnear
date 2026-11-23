import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { acceptRequest, declineRequest, getDeclined, getWorkerClaims, loadFeed, newFeedState, type FeedState } from '../lib/requests'
import { haversineMiles } from '../lib/geo'
import { dollarsToCents } from '../lib/money'
import { friendlyError } from '../lib/errors'
import ReportButton from '../components/ReportButton'
import { URGENCY, urgencyTone } from '../components/RequestCard'
import { Empty, ErrorBox, Field, Pill, Spinner, btn, btnGhost, card, input } from '../components/ui'
import type { RequestDoc } from '../lib/types'

type FirstPage = { page: Awaited<ReturnType<typeof loadFeed>>; dec: string[]; claims: Awaited<ReturnType<typeof getWorkerClaims>> }
// The first page is kept for 90 seconds (memory only), so going to another page and coming back does not re-read ~25 documents.
// The Refresh button, Accept and Decline always clear it, and a change to the worker's services or area makes a different key.
const FEED_TTL = 90_000
const feedCache = new Map<string, { at: number; r: FirstPage }>()

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
  const [selId, setSelId] = useState<string | null>(null)

  const fetchFirst = useCallback(async (force = false): Promise<FirstPage | null> => {
    if (!worker || !user) return null
    const key = `${user.uid}|${worker.workMode}|${worker.radiusMiles}|${worker.lat},${worker.lng}|${(worker.cities ?? []).join()}|${worker.matchKeys.join()}`
    const hit = feedCache.get(key)
    if (!force && hit && Date.now() - hit.at < FEED_TTL) return hit.r
    const [page, dec, claims] = await Promise.all([loadFeed(worker, newFeedState(worker)), getDeclined(user.uid), getWorkerClaims(user.uid, null, null)])
    const r = { page, dec, claims }
    feedCache.set(key, { at: Date.now(), r })
    return r
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
    fetchFirst(true).then(apply).catch((e) => setError(friendlyError(e))).finally(() => setLoading(false))
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
      feedCache.clear()
      setMine((s) => new Set(s).add(r.id))
      setItems((list) => list.map((x) => (x.id === r.id ? { ...x, claimsCount: x.claimsCount + 1 } : x)))
      setAccepting(null); setPrice(''); setNote('')
    } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }

  async function decline(r: RequestDoc) {
    if (!user) return
    try { setDeclined(await declineRequest(user.uid, declined, r.id)); feedCache.clear() } catch (e) { setError(friendlyError(e)) }
  }

  const visible = items.filter((r) => !declined.includes(r.id))
  const sel = visible.find((r) => r.id === selId) ?? visible[0]
  const dist = (r: RequestDoc) => (worker && worker.workMode !== 'cities' ? Math.max(1, Math.round(haversineMiles(worker.lat, worker.lng, r.lat, r.lng))) : null)
  const accepted = sel ? mine.has(sel.id) : false
  const full = sel ? sel.claimsCount >= (sel.workersNeeded ?? 1) : false
  return (
    <div className="space-y-4">
      {!verified && <p className="text-sm text-warn-tx">Verify your email to accept requests.</p>}
      <ErrorBox message={error} />
      <div className="grid items-start gap-6 lg:grid-cols-[26rem_1fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-3xl">Requests for you</h1>
            <button className={btnGhost} onClick={start}>Refresh</button>
          </div>
          {visible.length === 0 && !loading && <Empty>No open requests match your services and area right now. Check back soon.</Empty>}
          <ul className="space-y-2">
            {visible.map((r, i) => (
              <li key={r.id} className="hn-in" style={{ ['--i' as string]: i }}>
                <button type="button" onClick={() => { setSelId(r.id); setAccepting(null) }} aria-current={sel?.id === r.id} className={`w-full rounded-2xl border p-4 text-left transition ${sel?.id === r.id ? 'border-ye bg-pl' : 'border-ln bg-sf hover:border-bd'}`}>
                  <span className="flex justify-between gap-2"><b>{r.title}</b>{dist(r) != null && <span className="text-xs text-mu">{dist(r)} mi</span>}</span>
                  <span className="mt-0.5 block text-sm text-mu">{r.categoryName} · {URGENCY[r.urgency] ?? r.urgency}{r.budgetRange ? ` · ${r.budgetRange}` : ''}{mine.has(r.id) ? ' · Accepted' : ''}</span>
                </button>
              </li>
            ))}
          </ul>
          {loading && <Spinner />}
          {!loading && !done && <button className={btnGhost} onClick={() => void more()}>Load more</button>}
        </div>
        {sel && (
          <section key={sel.id} className={`${card} hn-in space-y-4 p-6 lg:sticky lg:top-24 lg:p-8`} aria-label="Request details">
            <div className="flex flex-wrap gap-2">
              <Pill tone={urgencyTone(sel.urgency)}>{URGENCY[sel.urgency] ?? sel.urgency}</Pill>
              <Pill>{sel.categoryName}</Pill>
              <Pill tone="g">Workers {sel.claimsCount} of {sel.workersNeeded ?? 1}</Pill>
            </div>
            <h2 className="text-3xl">{sel.title}</h2>
            <p className="text-sm text-mu">{sel.city}, {sel.state}{dist(sel) != null ? ` · ${dist(sel)} mi away` : ''}{sel.budgetRange ? ` · Budget ${sel.budgetRange}` : ''}</p>
            <p className="whitespace-pre-line">{sel.description}</p>
            <hr className="border-ln" />
            {accepted ? (
              <p className="font-semibold text-ac">You accepted this. Manage it in <Link to="/dashboard" className="underline">My jobs</Link>.</p>
            ) : accepting === sel.id ? (
              <form onSubmit={(e) => accept(e, sel)} className="space-y-4">
                <h3 className="text-xl">Send your offer</h3>
                <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                  <Field label="Your price (USD)" htmlFor={`p-${sel.id}`}><input id={`p-${sel.id}`} required inputMode="decimal" className={input} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
                  <Field label="What the price includes" htmlFor={`n-${sel.id}`}><input id={`n-${sel.id}`} required minLength={5} maxLength={500} className={input} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                </div>
                <p className="text-xs text-mu">The client sees your price and agrees before you start. Contact details are shared after you accept.</p>
                <div className="flex gap-2"><button className={btn} disabled={busy}>{busy ? 'Accepting...' : 'Accept this request'}</button><button type="button" className={btnGhost} onClick={() => setAccepting(null)}>Cancel</button></div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button className={btn} disabled={!verified || full} onClick={() => { setAccepting(sel.id); setPrice(''); setNote(''); setError(null) }}>{full ? 'All workers found' : 'Accept'}</button>
                <button className={btnGhost} onClick={() => decline(sel)}>Decline</button>
                <ReportButton targetType="request" targetId={sel.id} />
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
