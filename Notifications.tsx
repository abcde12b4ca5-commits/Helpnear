import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { listNotifications, markRead } from '../lib/notifications'
import { friendlyError } from '../lib/errors'
import { enablePush, pushSupported } from '../lib/push'
import { Empty, ErrorBox, Spinner, btnGhost, card } from '../components/ui'
import type { NotificationDoc } from '../lib/types'

export default function Notifications() {
  const { user } = useAuth()
  const [items, setItems] = useState<NotificationDoc[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [canPush, setCanPush] = useState(false)
  const [pushMsg, setPushMsg] = useState('')
  useEffect(() => { pushSupported().then(setCanPush).catch(() => setCanPush(false)) }, [])

  useEffect(() => {
    if (!user) return
    listNotifications(user.uid).then(setItems).catch((e) => { setError(friendlyError(e)); setItems([]) })
  }, [user])

  async function open(n: NotificationDoc) {
    if (!user || n.read) return
    try { await markRead(user.uid, n.id); setItems((l) => l?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null) } catch (e) { setError(friendlyError(e)) }
  }
  if (!items) return <Spinner />
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <ErrorBox message={error} />
      {canPush && (
        <p className="text-sm">
          <button className={btnGhost} onClick={async () => { try { setPushMsg((await enablePush(user!.uid)) === 'enabled' ? 'Push notifications enabled on this device.' : 'Permission was not granted.') } catch (e) { setError(friendlyError(e)) } }}>Enable push notifications</button>
          {pushMsg && <span className="ml-2" role="status">{pushMsg}</span>}
        </p>
      )}
      {items.length === 0 && <Empty>No notifications yet.</Empty>}
      <ul className="space-y-2">
        {items.map((n) => (
          <li key={n.id} className={`${card} flex items-center justify-between text-sm ${n.read ? 'opacity-70' : 'font-semibold'}`}>
            <span>{n.message}</span>
            <Link to="/my-requests" className="underline" onClick={() => open(n)}>{n.read ? 'View' : 'View and mark read'}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
