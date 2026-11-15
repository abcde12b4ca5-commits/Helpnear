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
import { Empty, ErrorBox, Field, Pill, Spinner, btn, btnGhost, card, input } from '../components/ui'
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

  const STEP: Record<string, number> = { accepted: 1, done: 3, confirmed: 4 }
  const renderJob = (c: ClaimDoc, i: number) => {
          const p = panel?.key === key(c) ? panel.kind : null
          const contact = contacts[c.requestId]
          return (
            <li key={key(c)} className={`${card} hn-lift hn-in`} style={{ ['--i' as string]: i }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg">{c.title}</h3>
                <span className="text-xs text-mu">{c.categoryName}</span>
              </div>
              <p className="mt-1 text-sm">Your price: <strong>{formatCents(c.quotedCents)}</strong>{c.status === 'confirmed' || c.status === 'done' ? <> &middot; Final: <strong>{formatCents(c.finalCents)}</strong></> : null}</p>
              <p className="text-sm text-mu">{c.note}</p>
              {STEP[c.status] && <div className="hn-bar mt-3" role="img" aria-label={`Progress ${STEP[c.status]} of 4`}><i style={{ width: `${(STEP[c.status] / 4) * 100}%` }} /></div>}
              <p className="mt-2 text-sm font-medium text-ac">{claimLabel(c, 'worker')}</p>
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
                <form onSubmit={(e) => submitQuote(e, c)} className="mt-3 space-y-3 rounded-xl border border-ln p-3">
                  <Field label="Price (USD)" htmlFor={`q-${c.requestId}`}><input id={`q-${c.requestId}`} required inputMode="decimal" className={input} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
                  <Field label="What it includes" htmlFor={`qn-${c.requestId}`}><textarea id={`qn-${c.requestId}`} required minLength={5} maxLength={500} rows={3} className={input} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                  <p className="text-xs text-mu">The client will be asked to agree again.</p>
                  <div className="flex gap-2"><button className={btn}>Save</button><button type="button" className={btnGhost} onClick={() => setPanel(null)}>Close</button></div>
                </form>
              )}
              {p === 'done' && (
                <form onSubmit={(e) => submitDone(e, c)} className="mt-3 space-y-3 rounded-xl border border-ln p-3">
                  <Field label="Final amount for the work (USD)" htmlFor={`f-${c.requestId}`} hint="The client will be asked to confirm that the service was done."><input id={`f-${c.requestId}`} required inputMode="decimal" className={input} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
                  <div className="flex gap-2"><button className={btn}>Mark as done</button><button type="button" className={btnGhost} onClick={() => setPanel(null)}>Close</button></div>
                </form>
              )}
              {p === 'dispute' && <DisputeForm onSubmit={(r) => act(() => openDispute(c, 'worker', r))} onClose={() => setPanel(null)} />}
              {p === 'cancel' && <CancelForm onCancel={(r) => act(() => cancelClaim(c, 'worker', r))} onClose={() => setPanel(null)} />}
            </li>
          )
  }
  return (
    <div className="space-y-4">
      <h1 className="text-4xl">My jobs</h1>
      <StatsGrid items={[
        ['In progress', stats?.active ?? dots], ['Waiting for client', stats?.waitingConfirmation ?? dots],
        ['Completed jobs', stats?.completed ?? dots], ['Total earned', stats ? formatCents(stats.totalCents) : dots],
      ]} />
      <p className="text-xs text-mu">Earnings count only jobs the client confirmed, using the final amount you entered. Payments are arranged directly with the client for now.</p>
      <div role="tablist" aria-label="Job status" className="hn-tabs">
        {TABS.map(([name, st]) => (
          <button key={name} role="tab" aria-selected={tab === st} onClick={() => { setLoading(true); setTab(st) }} className="hn-tab">{name}</button>
        ))}
      </div>
      {user && <StrikeNotice uid={user.uid} role="worker" />}
      <ErrorBox message={error} />
      {items.length === 0 && !loading && <Empty>No jobs here yet. Accept a request from the Requests page.</Empty>}
      {tab === null ? (
        <div className="grid gap-5 lg:grid-cols-3">
          {([['In progress', 'accepted'], ['Waiting for client', 'done'], ['Completed', 'confirmed']] as const).map(([name, st]) => {
            const col = items.filter((c) => c.status === st)
            return (
              <section key={st} className="space-y-3" aria-label={name}>
                <div className="flex items-center justify-between"><h2 className="text-lg">{name}</h2><Pill>{col.length}</Pill></div>
                <ul className="space-y-3">{col.map(renderJob)}</ul>
              </section>
            )
          })}
          {items.some((c) => !['accepted', 'done', 'confirmed'].includes(c.status)) && (
            <section className="space-y-3 lg:col-span-3" aria-label="Other">
              <h2 className="text-lg">Disputed and cancelled</h2>
              <ul className="grid gap-3 lg:grid-cols-3">{items.filter((c) => !['accepted', 'done', 'confirmed'].includes(c.status)).map(renderJob)}</ul>
            </section>
          )}
        </div>
      ) : (
      <ul className="grid gap-3 lg:grid-cols-2">{items.map(renderJob)}</ul>
      )}
      {loading && <Spinner />}
      {!loading && !done && <button className={btnGhost} onClick={() => void load(tab, cursor, false)}>Load more</button>}
    </div>
  )
}
