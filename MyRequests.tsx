import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getAppConfig } from '../lib/catalog'
import { ensureThread } from '../lib/chat'
import { closeRequest, getClaimers, getMyRequests, type Cursor } from '../lib/requests'
import { friendlyError } from '../lib/errors'
import RequestCard from '../components/RequestCard'
import { Empty, ErrorBox, Spinner, btn, btnGhost } from '../components/ui'
import type { ClaimDoc, RequestDoc } from '../lib/types'

export default function MyRequests() {
  const { user } = useAuth()
  const [items, setItems] = useState<RequestDoc[]>([])
  const [cursor, setCursor] = useState<Cursor>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claimers, setClaimers] = useState<Record<string, ClaimDoc[]>>({})
  const [chatEnabled, setChatEnabled] = useState(false)
  const nav = useNavigate()
  useEffect(() => { getAppConfig().then((c) => setChatEnabled(c.chatEnabled)).catch(() => undefined) }, [])

  const load = useCallback(async (after: Cursor, reset: boolean) => {
    if (!user) return
    try {
      const page = await getMyRequests(user.uid, after)
      setItems((prev) => (reset ? page.items : [...prev, ...page.items]))
      setCursor(page.cursor); setDone(page.done)
    } catch (e) { setError(friendlyError(e)) } finally { setLoading(false) }
  }, [user])

  const go = (after: Cursor, reset: boolean) => { setLoading(true); setError(null); void load(after, reset) }
  useEffect(() => {
    if (!user) return
    let active = true
    getMyRequests(user.uid, null)
      .then((page) => { if (active) { setItems(page.items); setCursor(page.cursor); setDone(page.done) } })
      .catch((e) => { if (active) setError(friendlyError(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My requests</h1>
        <div className="flex gap-2"><button className={btnGhost} onClick={() => go(null, true)}>Refresh</button><Link to="/post" className={btn}>New request</Link></div>
      </div>
      <ErrorBox message={error} />
      {items.length === 0 && !loading && <Empty>You have not posted a request yet.</Empty>}
      <ul className="space-y-3">
        {items.map((r) => (
          <RequestCard key={r.id} r={r}>
            {r.claimsCount > 0 && <button className={btnGhost} onClick={async () => { try { setClaimers({ ...claimers, [r.id]: await getClaimers(r.id) }) } catch (e) { setError(friendlyError(e)) } }}>Who claimed?</button>}
            {r.status === 'open' && <button className={btnGhost} onClick={async () => { try { await closeRequest(r.id); setItems(items.map((x) => (x.id === r.id ? { ...x, status: 'closed' } : x))) } catch (e) { setError(friendlyError(e)) } }}>Close request</button>}
            {claimers[r.id]?.map((c) => (
              <span key={c.workerId} className="flex items-center gap-2 text-sm">
                <Link className="underline" to={`/worker/${c.workerId}?request=${r.id}`}>{c.workerName}</Link>
                {chatEnabled && user && <button className="underline" onClick={async () => { try { nav(`/chat/${await ensureThread({ requestId: r.id, workerId: c.workerId, clientId: user.uid })}`) } catch (e) { setError(friendlyError(e)) } }}>Message</button>}
              </span>
            ))}
          </RequestCard>
        ))}
      </ul>
      {loading && <Spinner />}
      {!loading && !done && <button className={btnGhost} onClick={() => go(cursor, false)}>Load more</button>}
    </div>
  )
}
