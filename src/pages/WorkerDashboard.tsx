import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getAppConfig } from '../lib/catalog'
import { ensureThread } from '../lib/chat'
import { cancelClaim, editQuote, getContact, getWorkerClaims, getWorkerStats, markDone, openDispute, type Cursor, type Stats } from '../lib/requests'
import { dollarsToCents, formatCents } from '../lib/money'
import { claimLabel } from '../lib/labels'
import { friendlyError } from '../lib/errors'
import ReportButton from '../components/ReportButton'
import { CancelForm, DisputeForm, StatsGrid, StrikeNotice } from '../components/ClaimBits'
import { Empty, ErrorBox, Field, Spinner, btn, btnGhost, card, input } from '../components/ui'
import type { ClaimDoc, ClaimStatus, ContactDoc } from '../lib/types'

const TABS: [string, ClaimStatus | null][] = [['All', null], ['In progress', 'accepted'], ['Waiting for client', 'done'], ['Completed', 'confirmed'], ['Disputed', 'disputed'], ['Cancelled', 'cancelled']]

export default function WorkerDashboard() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [tab, setTab] = useState<ClaimStatus | null>(null)
  const [items, setItems] = useState<ClaimDoc[]>([])
  const [cursor, setCursor] = useState<Cursor>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsFailed, setStatsFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Record<string, ContactDoc>>({})
  const [chatEnabled, setChatEnabled] = useState(false)
  const [panel, setPanel] = useState<{ key: string; kind: 'quote' | 'done' | 'cancel' | 'dispute' } | null>(null)
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => { getAppConfig().then((c) => setChatEnabled(c.chatEnabled)).catch(() => undefined) }, [])

  const apply = useCallback((page: { items: ClaimDoc[]; cursor: Cursor; done: boolean }, reset: boolean) => {
    setItems((prev) => (reset ? page.items : [...prev, ...page.items]))
    setCursor(page.cursor); setDone(page.done)
  }, [])
  const run = useCallback((status: ClaimStatus | null, after: Cursor, reset: boolean) => {
    if (!user) return Promise.resolve()
    return getWorkerClaims(user.uid, status, after).then((p) => apply(p, reset)).catch((e) => setError(friendlyError(e))).finally(() => setLoading(false))
  }, [user, apply])
  const load = (status: ClaimStatus | null, after: Cursor, reset: boolean) => { setLoading(true); setError(null); void run(status, after, reset) }

  const reloadStats = useCallback(() => { if (user) getWorkerStats(user.uid).then(setStats).catch((e) => { console.error('stats failed', e); setStatsFailed(true) }) }, [user])
  useEffect(() => { void run(tab, null, true) }, [run, tab])
  useEffect(() => { reloadStats() }, [reloadStats])

  const dots = statsFailed ? '-' : '...'
  const key = (c: ClaimDoc) => c.requestId
  const refresh = () => { setPanel(null); void load(tab, null, true); reloadStats() }
  async function act(fn: () => Promise<void>) { setError(null); try { await fn(); refresh() } catch (e) { setError(friendlyError(e)) } }

  function open(c: ClaimDoc, kind: 'quote' | 'done' | 'cancel' | 'dispute') {
    setPanel({ key: key(c), kind }); setNote(c.note)
    setPrice((c.quotedCents / 100).toString())
  }

  async function submitQuote(e: FormEvent, c: ClaimDoc) {
    e.preventDefault()
    const cents = dollarsToCents(price)
    if (cents == null || cents <= 0) { setError('Enter a price in dollars.'); return }
    if (note.trim().length < 5) { setError('Describe what the price includes.'); return }
    await act(() => editQuote({ requestId: c.requestId, workerId: c.workerId, clientId: c.clientId, quotedCents: cents, note: note.trim() }))
  }
  async function submitDone(e: FormEvent, c: ClaimDoc) {
    e.preventDefault()
    const cents = dollarsToCents(price)
    if (cents == null) { setError('Enter the final amount in dollars.'); return }
    await act(() => markDone(c, cents))
  }
  async function showContact(id: string) {
    try { setContacts({ ...contacts, [id]: await getContact(id) }) } catch (e) { setError(friendlyError(e)) }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My jobs</h1>
      <StatsGrid items={[
        ['In progress', stats?.active ?? dots], ['Waiting for client', stats?.waitingConfirmation ?? dots],
        ['Completed jobs', stats?.completed ?? dots], ['Total earned', stats ? formatCents(stats.totalCents) : dots],
      ]} />
      <p className="text-xs text-gray-600">Earnings count only jobs the client confirmed, using the final amount you entered. Payments are arranged directly with the client for now.</p>
      <div role="tablist" aria-label="Job status" className="flex flex-wrap gap-2">
        {TABS.map(([name, st]) => (
          <button key={name} role="tab" aria-selected={tab === st} onClick={() => { setLoading(true); setTab(st) }} className={`rounded-md px-3 py-1 text-sm ${tab === st ? 'bg-emerald-700 text-white' : 'border border-gray-300 bg-white'}`}>{name}</button>
        ))}
      </div>
      {user && <StrikeNotice uid={user.uid} role="worker" />}
      <ErrorBox message={error} />
      {items.length === 0 && !loading && <Empty>No jobs here yet. Accept a request from the Requests page.</Empty>}
      <ul className="space-y-3">
        {items.map((c) => {
          const p = panel?.key === key(c) ? panel.kind : null
          const contact = contacts[c.requestId]
          return (
            <li key={key(c)} className={card}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{c.title}</h3>
                <span className="text-xs text-gray-600">{c.categoryName}</span>
              </div>
              <p className="mt-1 text-sm">Your price: <strong>{formatCents(c.quotedCents)}</strong>{c.status === 'confirmed' || c.status === 'done' ? <> &middot; Final: <strong>{formatCents(c.finalCents)}</strong></> : null}</p>
              <p className="text-sm text-gray-700">{c.note}</p>
              <p className="mt-1 text-sm font-medium text-emerald-900">{claimLabel(c, 'worker')}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {c.status !== 'cancelled' && (contact
                  ? <p className="text-sm">Contact ({contact.preferredContactMethod}): {contact.phone || '-'} &middot; {contact.email || '-'}</p>
                  : <button className={btnGhost} onClick={() => showContact(c.requestId)}>Show contact details</button>)}
                {chatEnabled && c.status !== 'cancelled' && user && <button className={btnGhost} onClick={async () => { try { nav(`/chat/${await ensureThread({ requestId: c.requestId, workerId: user.uid, clientId: c.clientId })}`) } catch (e) { setError(friendlyError(e)) } }}>Message</button>}
                {c.status === 'accepted' && !c.clientAgreed && <button className={btnGhost} onClick={() => open(c, 'quote')}>Edit price or scope</button>}
                {c.status === 'accepted' && c.clientAgreed && <button className={btn} onClick={() => open(c, 'done')}>Mark service as done</button>}
                {c.status === 'accepted' && <button className={btnGhost} onClick={() => open(c, 'cancel')}>Cancel job</button>}
                {((c.status === 'accepted' && c.clientAgreed) || c.status === 'done') && <button className={btnGhost} onClick={() => open(c, 'dispute')}>Report a problem</button>}
                <ReportButton targetType="request" targetId={c.requestId} />
              </div>
              {p === 'quote' && (
                <form onSubmit={(e) => submitQuote(e, c)} className="mt-3 space-y-3 rounded-md border border-gray-200 p-3">
                  <Field label="Price (USD)" htmlFor={`q-${c.requestId}`}><input id={`q-${c.requestId}`} required inputMode="decimal" className={input} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
                  <Field label="What it includes" htmlFor={`qn-${c.requestId}`}><textarea id={`qn-${c.requestId}`} required minLength={5} maxLength={500} rows={3} className={input} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                  <p className="text-xs text-gray-600">The client will be asked to agree again.</p>
                  <div className="flex gap-2"><button className={btn}>Save</button><button type="button" className={btnGhost} onClick={() => setPanel(null)}>Close</button></div>
                </form>
              )}
              {p === 'done' && (
                <form onSubmit={(e) => submitDone(e, c)} className="mt-3 space-y-3 rounded-md border border-gray-200 p-3">
                  <Field label="Final amount for the work (USD)" htmlFor={`f-${c.requestId}`} hint="The client will be asked to confirm that the service was done."><input id={`f-${c.requestId}`} required inputMode="decimal" className={input} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
                  <div className="flex gap-2"><button className={btn}>Mark as done</button><button type="button" className={btnGhost} onClick={() => setPanel(null)}>Close</button></div>
                </form>
              )}
              {p === 'dispute' && <DisputeForm onSubmit={(r) => act(() => openDispute(c, 'worker', r))} onClose={() => setPanel(null)} />}
              {p === 'cancel' && <CancelForm onCancel={(r) => act(() => cancelClaim(c, 'worker', r))} onClose={() => setPanel(null)} />}
            </li>
          )
        })}
      </ul>
      {loading && <Spinner />}
      {!loading && !done && <button className={btnGhost} onClick={() => void load(tab, cursor, false)}>Load more</button>}
    </div>
  )
}
