import { useEffect, useState, type FormEvent } from 'react'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { setUserSuspended } from '../../lib/admin'
import { friendlyError } from '../../lib/errors'
import { Empty, ErrorBox, Spinner, btn, btnGhost, card, input } from '../../components/ui'
import type { UserDoc } from '../../lib/types'

type Row = UserDoc & { id: string }

export default function Users() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const fetchRows = async (search: string) => {
    const q = search ? query(collection(db, 'users'), where('email', '==', search.toLowerCase()), limit(1)) : query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(20))
    const s = await getDocs(q)
    return s.docs.map((d) => ({ ...(d.data() as UserDoc), id: d.id }))
  }
  useEffect(() => { fetchRows('').then(setRows).catch((e) => { setErr(friendlyError(e)); setRows([]) }) }, [])

  async function search(e: FormEvent) {
    e.preventDefault()
    try { setErr(null); setRows(await fetchRows(email.trim())) } catch (er) { setErr(friendlyError(er)) }
  }
  async function toggle(r: Row) {
    if (!user) return
    try { await setUserSuspended(user.uid, r.id, r.role, r.status === 'active'); setRows((l) => l?.map((x) => (x.id === r.id ? { ...x, status: r.status === 'active' ? 'suspended' : 'active' } : x)) ?? null) } catch (e) { setErr(friendlyError(e)) }
  }
  if (!rows) return <Spinner />
  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex gap-2">
        <input aria-label="Exact email" type="email" className={input} placeholder="Search by exact email (empty = latest 20)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className={btn}>Search</button>
      </form>
      <ErrorBox message={err} />
      {rows.length === 0 && <Empty>No users found.</Empty>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className={`${card} flex flex-wrap items-center justify-between gap-2 text-sm`}>
            <span>{r.displayName} &middot; {r.email} &middot; {r.role} &middot; <strong>{r.status}</strong> <code className="text-xs text-gray-600">{r.id}</code></span>
            <button className={btnGhost} onClick={() => toggle(r)}>{r.status === 'active' ? 'Suspend' : 'Unsuspend'}</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
