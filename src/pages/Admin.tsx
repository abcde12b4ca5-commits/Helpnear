import { Fragment, useEffect, useState } from 'react'
import type * as React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Spinner } from '../components/ui'
import { Icon } from '../components/AdminIcon'
import { getArticleSettings, type ArticleSettings } from '../lib/articles'
import { brand } from '../config/brand'
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

// Two looks for the same panel: the side menu ("classic") and the floating pill header with soft cards ("bento"). The choice is kept in this browser.
type Layout = 'classic' | 'bento'
const LAYOUT_KEY = 'hn-admin-layout'
const readLayout = (): Layout => { try { return localStorage.getItem(LAYOUT_KEY) === 'bento' ? 'bento' : 'classic' } catch { return 'classic' } }

function LayoutSwitch({ layout, onChange }: { layout: Layout; onChange: (l: Layout) => void }) {
  return (
    <div className="ad-seg" role="group" aria-label="تصميم لوحة التحكم">
      <button type="button" aria-pressed={layout === 'classic'} onClick={() => onChange('classic')}>كلاسيكي</button>
      <button type="button" aria-pressed={layout === 'bento'} onClick={() => onChange('bento')}>Bento</button>
    </div>
  )
}

/** The small status pill next to the page title: is the automatic article writing on, and did its last run work. */
function chipOf(s: ArticleSettings | null): { cls: string; text: string } | null {
  if (!s) return null
  if (s.mode === 'off') return { cls: 'off', text: 'النشر التلقائي متوقف' }
  if (s.lastError) return { cls: 'bad', text: 'آخر تشغيل تلقائي فشل' }
  return { cls: 'ok', text: s.mode === 'publish' ? 'النشر التلقائي يعمل' : 'الكتابة التلقائية تعمل (مسودات)' }
}

export default function Admin() {
  const { user, isAdmin, loading } = useAuth()
  const [tab, setTab] = useState<string>('Dashboard')
  const [auto, setAuto] = useState<ArticleSettings | null>(null)
  const [layout, setLayout] = useState<Layout>(readLayout)
  const changeLayout = (l: Layout) => { setLayout(l); try { localStorage.setItem(LAYOUT_KEY, l) } catch { /* storage blocked: the choice lasts until the page closes */ } }
  // One small read each time the panel opens a tab, so the status pill and the dashboard card are never stale.
  useEffect(() => { if (isAdmin) getArticleSettings().then(setAuto).catch(() => setAuto(null)) }, [tab, isAdmin])
  if (loading) return <Spinner label="جارٍ التحميل..." />
  if (!user || !isAdmin) return <Navigate to="/" replace />
  const current = ALL.find(([id]) => id === tab) ?? ALL[0]
  const group = GROUPS.find((g) => g.tabs.some(([id]) => id === current[0]))?.title ?? ''
  const Active = current[3] as () => React.ReactElement
  const chip = chipOf(auto)
  const chipEl = chip && <span className={`ad-chip ${chip.cls}`} role="status">{chip.text}</span>
  if (layout === 'bento') {
    return (
      <div className="ad ad-bento" dir="rtl" lang="ar" translate="no">
        <header className="bn-head">
          <div className="bn-brand">
            <i aria-hidden="true"><img src="/img/logo-mark.png" alt="" width="40" height="40" /></i>
            <span><b>{brand.name}</b><small>لوحة التحكم</small></span>
          </div>
          <nav role="tablist" aria-label="أقسام لوحة التحكم" className="bn-nav">
            {GROUPS.map((g, gi) => (
              <Fragment key={g.title}>
                {gi > 0 && <span className="bn-sep" aria-hidden="true" />}
                {g.tabs.map(([id, label, icon]) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="bn-pill"><Icon n={icon} />{label}</button>
                ))}
              </Fragment>
            ))}
          </nav>
          <span className="ad-av" aria-hidden="true" title={user.email ?? ''}>{(user.email ?? 'A').charAt(0).toUpperCase()}</span>
        </header>
        <main className="bn-main">
          <div className="ad-top">
            <div><p className="ad-crumb">لوحة التحكم / {group}</p><h1>{current[1]}</h1></div>
            <div className="ad-tools">{chipEl}<LayoutSwitch layout={layout} onChange={changeLayout} /></div>
          </div>
          {tab === 'Dashboard' ? <Dashboard onGo={setTab} auto={auto} /> : <Active />}
        </main>
      </div>
    )
  }
  return (
    <div className="ad" dir="rtl" lang="ar" translate="no">
      <nav role="tablist" aria-label="أقسام لوحة التحكم" aria-orientation="vertical" className="ad-side">
        <div className="ad-brand">
          <i aria-hidden="true"><img src="/img/logo-mark.png" alt="" width="40" height="40" /></i>
          <span><b>{brand.name}</b><small>لوحة التحكم</small></span>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title} className="contents">
            <p className="ad-grp">{g.title}</p>
            {g.tabs.map(([id, label, icon]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="ad-nav"><Icon n={icon} />{label}</button>
            ))}
          </div>
        ))}
        <div className="ad-me"><span className="ad-av" aria-hidden="true">{(user.email ?? 'A').charAt(0).toUpperCase()}</span><span>مسؤول<small className="ad-ltr">{user.email}</small></span></div>
      </nav>
      <div className="min-w-0 space-y-5">
        <div className="ad-top">
          <div><p className="ad-crumb">لوحة التحكم / {group}</p><h1>{current[1]}</h1></div>
          <div className="ad-tools">{chipEl}<LayoutSwitch layout={layout} onChange={changeLayout} /></div>
        </div>
        {tab === 'Dashboard' ? <Dashboard onGo={setTab} auto={auto} /> : <Active />}
      </div>
    </div>
  )
}
