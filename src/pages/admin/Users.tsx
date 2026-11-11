import { useEffect, useState, type FormEvent } from 'react'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { setUserSuspended } from '../../lib/admin'
import { getAppConfig } from '../../lib/catalog'
import { banAndVoid, escalate, freezeUser, getUserStrikes, removeStrike, unfreezeUser } from '../../lib/discipline'
import { friendlyError } from '../../lib/errors'
import { Empty, ErrorBox, Spinner, btn, btnGhost, card, input } from '../../components/ui'
import type { StrikeDoc, UserDoc } from '../../lib/types'

type Row = UserDoc & { id: string }

const when = (t: { toDate(): Date } | null | undefined) => (t ? t.toDate().toLocaleString('en-US') : '-')

const toRows = (s: Awaited<ReturnType<typeof getDocs>>) => s.docs.map((d) => ({ ...(d.data() as UserDoc), id: d.id }))
const fetchRows = async (search: string) => {
  const q = search ? query(collection(db, 'users'), where('email', '==', search.toLowerCase()), limit(1)) : query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(20))
  return toRows(await getDocs(q))
}

export default function Users() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [freezeDays, setFreezeDays] = useState(7)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [strikes, setStrikes] = useState<Record<string, StrikeDoc[]>>({})
  const [now] = useState(() => Date.now())

  useEffect(() => {
    getAppConfig().then((c) => setFreezeDays(c.freezeDays)).catch(() => undefined)
    fetchRows('').then(setRows).catch((e) => { setErr(friendlyError(e)); setRows([]) })
  }, [])

  async function search(e: FormEvent) {
    e.preventDefault()
    try { setErr(null); setRows(await fetchRows(email.trim())) } catch (er) { setErr(friendlyError(er)) }
  }
  async function showFlagged() {
    try { setErr(null); setRows(toRows(await getDocs(query(collection(db, 'users'), where('needsReview', '==', true), limit(20))))) } catch (er) { setErr(friendlyError(er)) }
  }
  async function act(r: Row, fn: () => Promise<string | void>) {
    if (!user) return
    try {
      setErr(null); setMsg(null)
      const out = await fn()
      if (out) setMsg(out)
      setRows(await fetchRows(email.trim()))
      if (strikes[r.id]) setStrikes({ ...strikes, [r.id]: await getUserStrikes(r.id) })
    } catch (e) { setErr(friendlyError(e)) }
  }
  async function loadStrikes(r: Row) {
    try { setStrikes({ ...strikes, [r.id]: await getUserStrikes(r.id) }) } catch (e) { setErr(friendlyError(e)) }
  }

  if (!rows) return <Spinner />
  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <input aria-label="Exact email" type="email" className={`${input} flex-1`} placeholder="Search by exact email (empty = latest 20)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className={btn}>Search</button>
        <button type="button" className={btnGhost} onClick={showFlagged}>Show accounts flagged for review</button>
      </form>
      <ErrorBox message={err} />
      {msg && <p role="status" className="text-sm text-emerald-800">{msg}</p>}
      {rows.length === 0 && <Empty>No users found.</Empty>}
      <ul className="space-y-2">
        {rows.map((r) => {
          const frozen = r.frozenUntil && r.frozenUntil.toMillis() > now
          const reason = reasons[r.id] ?? ''
          return (
            <li key={r.id} className={`${card} space-y-2 text-sm`}>
              <p>
                {r.displayName} &middot; {r.email} &middot; {r.role} &middot; <strong>{r.status}</strong> <code className="text-xs text-gray-600">{r.id}</code>
                {frozen && <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-red-900">frozen until {when(r.frozenUntil)}{r.frozenReason ? `: ${r.frozenReason}` : ''}</span>}
                {r.needsReview && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-900">needs review{r.reviewReason ? `: ${r.reviewReason}` : ''}</span>}
              </p>
              <label className="block text-xs text-gray-700">Reason or note (used by Escalate and Freeze)
                <input className={`${input} mt-1`} maxLength={200} value={reason} onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })} />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button className={btnGhost} onClick={() => user && act(r, () => setUserSuspended(user.uid, r.id, r.role, r.status === 'active'))}>{r.status === 'active' ? 'Suspend' : 'Unsuspend'}</button>
                <button className={btnGhost} onClick={() => user && act(r, () => escalate(user.uid, r.id, r.role, reason))}>Escalate (warning, freeze, ban)</button>
                <span className="flex items-center gap-1">
                  <input aria-label="Freeze days" type="number" min={1} max={90} className={`${input} w-20`} value={freezeDays} onChange={(e) => setFreezeDays(Math.min(90, Math.max(1, Number(e.target.value) || 1)))} />
                  <button className={btnGhost} onClick={() => user && act(r, async () => { await freezeUser(user.uid, r.id, freezeDays, reason || 'Fair-use limit'); return `Frozen for ${freezeDays} days.` })}>Freeze days</button>
                </span>
                {(frozen || r.needsReview) && <button className={btnGhost} onClick={() => user && act(r, async () => { await unfreezeUser(user.uid, r.id); return 'Freeze and review flag cleared.' })}>Unfreeze / clear review</button>}
                <button className={btnGhost} onClick={() => loadStrikes(r)}>Strikes</button>
                <button className={btnGhost} onClick={() => {
                  if (user && window.confirm(`Ban ${r.email}${r.role === 'worker' ? ' and remove all of their confirmed jobs from earnings' : ''}? Use this for fraud only.`)) {
                    void act(r, async () => `Banned.${r.role === 'worker' ? ` ${await banAndVoid(user.uid, r.id, r.role)} confirmed jobs removed.` : ''}`)
                  }
                }}>Ban (fraud)</button>
              </div>
              {strikes[r.id] && (
                <ul className="space-y-1 rounded-md bg-gray-50 p-2">
                  {strikes[r.id].length === 0 && <li className="text-gray-600">No strikes.</li>}
                  {strikes[r.id].map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <span>{when(s.createdAt)} &middot; <strong>{s.type}</strong> &middot; {s.by}{s.note ? ` \u00b7 ${s.note}` : ''}</span>
                      <button className={btnGhost} onClick={() => user && act(r, async () => { await removeStrike(user.uid, s.id); return 'Strike removed.' })}>Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
