import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getAppConfig } from '../lib/catalog'
import { ensureThread } from '../lib/chat'
import ReportButton from '../components/ReportButton'
import { getContact, getMyClaims } from '../lib/requests'
import { friendlyError } from '../lib/errors'
import RequestCard from '../components/RequestCard'
import { Empty, ErrorBox, Spinner, btnGhost } from '../components/ui'
import type { ContactDoc, RequestDoc } from '../lib/types'

export default function Claims() {
  const { user } = useAuth()
  const [items, setItems] = useState<RequestDoc[] | null>(null)
  const [contacts, setContacts] = useState<Record<string, ContactDoc>>({})
  const [error, setError] = useState<string | null>(null)
  const [chatEnabled, setChatEnabled] = useState(false)
  const nav = useNavigate()
  useEffect(() => { getAppConfig().then((c) => setChatEnabled(c.chatEnabled)).catch(() => undefined) }, [])

  useEffect(() => {
    if (!user) return
    getMyClaims(user.uid).then(setItems).catch((e) => { setError(friendlyError(e)); setItems([]) })
  }, [user])

  async function show(id: string) {
    try { setContacts({ ...contacts, [id]: await getContact(id) }) } catch (e) { setError(friendlyError(e)) }
  }

  if (!items) return <Spinner />
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My claims</h1>
      <ErrorBox message={error} />
      {items.length === 0 && <Empty>You have not claimed any requests yet.</Empty>}
      <ul className="space-y-3">
        {items.map((r) => (
          <RequestCard key={r.id} r={r}>
            {contacts[r.id]
              ? <p className="text-sm">Contact ({contacts[r.id].preferredContactMethod}): {contacts[r.id].phone || '-'} &middot; {contacts[r.id].email || '-'}</p>
              : <button className={btnGhost} onClick={() => show(r.id)}>Show contact details</button>}
            {chatEnabled && user && <button className={btnGhost} onClick={async () => { try { nav(`/chat/${await ensureThread({ requestId: r.id, workerId: user.uid, clientId: r.clientId })}`) } catch (e) { setError(friendlyError(e)) } }}>Message</button>}
            <ReportButton targetType="request" targetId={r.id} />
          </RequestCard>
        ))}
      </ul>
    </div>
  )
}
