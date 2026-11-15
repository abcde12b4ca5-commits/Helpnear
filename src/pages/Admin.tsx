import { useState } from 'react'
import type * as React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Spinner } from '../components/ui'
import Dashboard from './admin/Dashboard'
import Settings from './admin/Settings'
import Categories from './admin/Categories'
import Coverage from './admin/Coverage'
import Moderation from './admin/Moderation'
import Disputes from './admin/Disputes'
import Users from './admin/Users'
import LegalEditor from './admin/LegalEditor'
import AuditLog from './admin/AuditLog'

const TABS = [
  ['Dashboard', Dashboard], ['Settings', Settings], ['Categories', Categories], ['Coverage', Coverage],
  ['Moderation', Moderation], ['Disputes', Disputes], ['Users', Users], ['Legal', LegalEditor], ['Audit log', AuditLog],
] as const

export default function Admin() {
  const { user, isAdmin, loading } = useAuth()
  const [tab, setTab] = useState<string>('Dashboard')
  if (loading) return <Spinner />
  if (!user || !isAdmin) return <Navigate to="/" replace />
  const Active = (TABS.find(([n]) => n === tab)?.[1] ?? Dashboard) as () => React.ReactElement
  return (
    <div className="space-y-4">
      <h1 className="text-4xl">Admin</h1>
      <div role="tablist" aria-label="Admin sections" className="hn-tabs">
        {TABS.map(([n]) => (
          <button key={n} role="tab" aria-selected={tab === n} onClick={() => setTab(n)} className="hn-tab">{n}</button>
        ))}
      </div>
      {tab === 'Dashboard' ? <Dashboard onGo={setTab} /> : <Active />}
    </div>
  )
}
