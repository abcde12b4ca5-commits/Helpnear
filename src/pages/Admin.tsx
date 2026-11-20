import { useState } from 'react'
import type * as React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Spinner } from '../components/ui'
import { Icon } from '../components/AdminIcon'
import Dashboard from './admin/Dashboard'
import Settings from './admin/Settings'
import Categories from './admin/Categories'
import Coverage from './admin/Coverage'
import Moderation from './admin/Moderation'
import Disputes from './admin/Disputes'
import Users from './admin/Users'
import LegalEditor from './admin/LegalEditor'
import AuditLog from './admin/AuditLog'
import Articles from './admin/Articles'

// [id (kept in English, used by the Dashboard shortcuts), Arabic label, icon, component]
const GROUPS: { title: string; tabs: [string, string, string, unknown][] }[] = [
  { title: 'نظرة عامة', tabs: [['Dashboard', 'لوحة المعلومات', 'grid', Dashboard]] },
  { title: 'العمليات', tabs: [['Moderation', 'المراجعة', 'shield', Moderation], ['Disputes', 'النزاعات', 'clock', Disputes], ['Users', 'المستخدمون', 'users', Users]] },
  { title: 'المحتوى', tabs: [['Categories', 'الخدمات', 'doc', Categories], ['Articles', 'المقالات', 'doc', Articles], ['Legal', 'الصفحات القانونية', 'doc', LegalEditor]] },
  { title: 'المنصة', tabs: [['Settings', 'الإعدادات', 'gear', Settings], ['Coverage', 'التغطية', 'grid', Coverage], ['Audit log', 'سجل الإجراءات', 'clock', AuditLog]] },
]
const ALL = GROUPS.flatMap((g) => g.tabs)

export default function Admin() {
  const { user, isAdmin, loading } = useAuth()
  const [tab, setTab] = useState<string>('Dashboard')
  if (loading) return <Spinner label="جارٍ التحميل..." />
  if (!user || !isAdmin) return <Navigate to="/" replace />
  const current = ALL.find(([id]) => id === tab) ?? ALL[0]
  const Active = current[3] as () => React.ReactElement
  return (
    <div className="ad" dir="rtl" lang="ar" translate="no">
      <nav role="tablist" aria-label="أقسام لوحة التحكم" aria-orientation="vertical" className="ad-side">
        {GROUPS.map((g) => (
          <div key={g.title} className="contents">
            <p className="ad-grp">{g.title}</p>
            {g.tabs.map(([id, label, icon]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="ad-nav"><Icon n={icon} />{label}</button>
            ))}
          </div>
        ))}
      </nav>
      <div className="min-w-0 space-y-4">
        <div className="ad-head"><h1>{current[1]}</h1><p>لوحة التحكم</p></div>
        {tab === 'Dashboard' ? <Dashboard onGo={setTab} /> : <Active />}
      </div>
    </div>
  )
}
