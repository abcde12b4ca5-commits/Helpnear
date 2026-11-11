import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { getAppConfig, DEFAULT_CONFIG } from '../lib/catalog'
import { claimRequest, getFeed, type Cursor } from '../lib/requests'
import { friendlyError } from '../lib/errors'
import ReportButton from '../components/ReportButton'
import RequestCard from '../components/RequestCard'
import { Empty, ErrorBox, Spinner, btn, btnGhost } from '../components/ui'
import type { AppConfig, RequestDoc } from '../lib/types'

export default function Feed() {
  const { user, worker, verified } = useAuth()
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [items, setItems] = useState<RequestDoc[]>([])
  const [cursor, setCursor] = useState<Cursor>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<string[]>([])

  const load = useCallback(async (after: Cursor, reset: boolean) => {
    if (!worker) return
    try {
      const page = await getFeed(worker, after)
      setItems((prev) => (reset ? page.items : [...prev, ...page.items]))
      setCursor(page.cursor); setDone(page.done)
    } catch (e) { setError(friendlyError(e)) } finally { setLoading(false) }
  }, [worker])

  useEffect(() => { getAppConfig().then(setConfig).catch(() => undefined) }, [])
  const go = (after: Cursor, reset: boolean) => { setLoading(true); setError(null); void load(after, reset) }
  useEffect(() => {
    if (!worker) return
    let active = true
    getFeed(worker, null)
      .then((page) => { if (active) { setItems(page.items); setCursor(page.cursor); setDone(page.done) } })
      .catch((e) => { if (active) setError(friendlyError(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [worker])

  async function claim(r: RequestDoc) {
    if (!user || !worker) return
    setClaiming(r.id); setError(null)
    try {
      await claimRequest(r.id, user.uid, worker.displayName)
      setClaimed((c) => [...c, r.id])
      setItems((list) => list.map((x) => (x.id === r.id ? { ...x, claimsCount: x.claimsCount + 1 } : x)))
    } catch (e) { setError(friendlyError(e)) } finally { setClaiming(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Requests for you</h1>
        <button className={btnGhost} onClick={() => go(null, true)}>Refresh</button>
      </div>
      {!verified && <p className="text-sm text-amber-900">Verify your email to claim requests.</p>}
      <ErrorBox message={error} />
      {items.length === 0 && !loading && <Empty>No open requests match your services and areas right now. Check back soon.</Empty>}
      <ul className="space-y-3">
        {items.map((r) => {
          const full = r.claimsCount >= config.maxClaimsPerRequest
          const mine = claimed.includes(r.id)
          return (
            <RequestCard key={r.id} r={r}>
              {mine
                ? <span className="text-sm font-medium text-emerald-800">Claimed. See contact details under My claims.</span>
                : <button className={btn} disabled={!verified || full || claiming === r.id} onClick={() => claim(r)}>{full ? 'Full' : claiming === r.id ? 'Claiming...' : 'Claim this request'}</button>}
              <ReportButton targetType="request" targetId={r.id} />
            </RequestCard>
          )
        })}
      </ul>
      {loading && <Spinner />}
      {!loading && !done && <button className={btnGhost} onClick={() => go(cursor, false)}>Load more</button>}
    </div>
  )
}
