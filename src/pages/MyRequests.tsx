import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getAppConfig } from '../lib/catalog'
import { ensureThread } from '../lib/chat'
import { agreeClaim, cancelClaim, cancelRequest, closeRequest, confirmDone, getClientStats, getMyRequests, getRequestClaims, openDispute, reopenClaim, type Cursor, type Stats } from '../lib/requests'
import { formatCents } from '../lib/money'
import { claimLabel } from '../lib/labels'
import { friendlyError } from '../lib/errors'
import RequestCard from '../components/RequestCard'
import { CancelForm, DisputeForm, StatsGrid, StrikeNotice } from '../components/ClaimBits'
import { Empty, ErrorBox, Spinner, btn, btnGhost } from '../components/ui'
import type { ClaimDoc, RequestDoc } from '../lib/types'

export default function MyRequests() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [items, setItems] = useState<RequestDoc[]>([])
  const [claims, setClaims] = useState<Record<string, ClaimDoc[]>>({})
  const [cursor, setCursor] = useState<Cursor>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsFailed, setStatsFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatEnabled, setChatEnabled] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [disputing, setDisputing] = useState<string | null>(null)
  useEffect(() => { getAppConfig().then((c) => setChatEnabled(c.chatEnabled)).catch(() => undefined) }, [])

  const apply = useCallback((page: { items: RequestDoc[]; cursor: Cursor; done: boolean }, lists: Record<string, ClaimDoc[]>, reset: boolean) => {
    setItems((prev) => (reset ? page.items : [...prev, ...page.items]))
    setClaims((prev) => ({ ...prev, ...lists }))
    setCursor(page.cursor); setDone(page.done)
  }, [])
  const fetchPage = useCallback(async (after: Cursor) => {
    if (!user) return null
    const page = await getMyRequests(user.uid, after)
    const withClaims = page.items.filter((r) => r.claimsCount > 0)
    const lists = await Promise.all(withClaims.map((r) => getRequestClaims(r.id)))
    return { page, lists: Object.fromEntries(withClaims.map((r, i) => [r.id, lists[i]])) as Record<string, ClaimDoc[]> }
  }, [user])
  const run = useCallback((after: Cursor, reset: boolean) =>
    fetchPage(after).then((r) => { if (r) apply(r.page, r.lists, reset) }).catch((e) => setError(friendlyError(e))).finally(() => setLoading(false)), [fetchPage, apply])
  const load = (after: Cursor, reset: boolean) => { setLoading(true); setError(null); return run(after, reset) }

  const reloadStats = useCallback(() => { if (user) getClientStats(user.uid).then(setStats).catch((e) => { console.error('stats failed', e); setStatsFailed(true) }) }, [user])
  useEffect(() => { void run(null, true) }, [run])
  useEffect(() => { reloadStats() }, [reloadStats])

  async function act(fn: () => Promise<void>) {
    setError(null)
    try { await fn(); setCancelling(null); await load(null, true); reloadStats() } catch (e) { setError(friendlyError(e)) }
  }

  const dots = statsFailed ? '-' : '...'
  // requests posted together (several kinds of workers) are shown as one job
  const groups: { id: string; reqs: RequestDoc[] }[] = []
  for (const r of items) {
    const id = r.groupId ?? r.id
    const g = groups.find((x) => x.id === id)
    if (g) g.reqs.push(r); else groups.push({ id, reqs: [r] })
  }
  for (const g of groups) g.reqs.sort((a, b) => a.id.localeCompare(b.id))

  const renderRequest = (r: RequestDoc) => (
          <RequestCard key={r.id} r={r}>
            {(r.status === 'open' || r.status === 'filled') && <button className={btnGhost} onClick={() => act(() => closeRequest(r.id))}>Stop taking more workers</button>}
            {(r.status === 'open' || r.status === 'filled') && <button className={btnGhost} onClick={() => setCancelling(`req:${r.id}`)}>Cancel request</button>}
            {cancelling === `req:${r.id}` && (
              <div className="w-full">
                <p className="text-xs text-gray-700">This cancels the request and every worker who has not finished yet. Workers are told. Please cancel only when you really do not need the work: repeated late cancellations can limit your account.</p>
                <CancelForm onCancel={(reason) => act(() => cancelRequest(r.id, claims[r.id] ?? [], reason))} onClose={() => setCancelling(null)} />
              </div>
            )}
            {claims[r.id]?.map((c) => {
              const k = `${r.id}_${c.workerId}`
              return (
                <div key={k} className="mt-2 w-full rounded-md border border-gray-200 p-3 text-sm">
                  <p><Link className="font-semibold underline" to={`/worker/${c.workerId}?request=${r.id}`}>{c.workerName}</Link> &middot; Price: <strong>{formatCents(c.quotedCents)}</strong>{(c.status === 'done' || c.status === 'confirmed') && <> &middot; Final: <strong>{formatCents(c.finalCents)}</strong></>}</p>
                  <p className="text-gray-700">{c.note}</p>
                  <p className="mt-1 font-medium text-emerald-900">{claimLabel(c, 'client')}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.status === 'accepted' && !c.clientAgreed && <button className={btn} onClick={() => act(() => agreeClaim(c))}>Agree to price and work</button>}
                    {c.status === 'done' && <button className={btn} onClick={() => act(() => confirmDone(c))}>Confirm service was done</button>}
                    {c.status === 'done' && <button className={btnGhost} onClick={() => act(async () => { await reopenClaim(c) })}>Not done yet</button>}
                    {c.status === 'confirmed' && <Link className={btnGhost} to={`/worker/${c.workerId}?request=${r.id}`}>Rate this worker</Link>}
                    {c.status === 'accepted' && <button className={btnGhost} onClick={() => setCancelling(k)}>Cancel this worker</button>}
                    {((c.status === 'accepted' && c.clientAgreed) || c.status === 'done') && <button className={btnGhost} onClick={() => setDisputing(k)}>Report a problem</button>}
                    {chatEnabled && c.status !== 'cancelled' && user && <button className={btnGhost} onClick={async () => { try { nav(`/chat/${await ensureThread({ requestId: r.id, workerId: c.workerId, clientId: user.uid })}`) } catch (e) { setError(friendlyError(e)) } }}>Message</button>}
                  </div>
                  {disputing === k && user && <DisputeForm onSubmit={(reason) => act(async () => { await openDispute(c, 'client', reason); setDisputing(null) })} onClose={() => setDisputing(null)} />}
                  {cancelling === k && <CancelForm onCancel={(reason) => act(() => cancelClaim(c, 'client', reason))} onClose={() => setCancelling(null)} />}
                </div>
              )
            })}
          </RequestCard>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My requests</h1>
        <div className="flex gap-2"><button className={btnGhost} onClick={() => { void load(null, true); reloadStats() }}>Refresh</button><Link to="/post" className={btn}>New request</Link></div>
      </div>
      <StatsGrid items={[
        ['Requests posted', stats?.requests ?? dots], ['Work in progress', stats ? stats.active + stats.waitingConfirmation : dots],
        ['Services completed', stats?.completed ?? dots], ['Total confirmed', stats ? formatCents(stats.totalCents) : dots],
      ]} />
      {user && <StrikeNotice uid={user.uid} role="client" />}
      <ErrorBox message={error} />
      {items.length === 0 && !loading && <Empty>You have not posted a request yet.</Empty>}
      <ul className="space-y-3">
        {groups.map((g) => (g.reqs.length > 1 || (g.reqs[0].groupSize ?? 1) > 1) ? (
          <li key={g.id} className="space-y-2">
            <p className="text-sm font-semibold">
              Job with {g.reqs.reduce((n, r) => n + r.workersNeeded, 0)} workers in {g.reqs.length} groups
              {' '}&middot; price agreed with {g.reqs.reduce((n, r) => n + (claims[r.id]?.filter((c) => c.clientAgreed && c.status !== 'cancelled').length ?? 0), 0)} of {g.reqs.reduce((n, r) => n + r.workersNeeded, 0)}
            </p>
            <ul className="space-y-3 border-l-2 border-emerald-200 pl-3">{g.reqs.map(renderRequest)}</ul>
          </li>
        ) : renderRequest(g.reqs[0]))}
      </ul>
      {loading && <Spinner />}
      {!loading && !done && <button className={btnGhost} onClick={() => void load(cursor, false)}>Load more</button>}
    </div>
  )
}
