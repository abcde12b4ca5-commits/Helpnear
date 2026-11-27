import { Fragment, useCallback, useEffect, useState } from 'react'
import type * as React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Spinner } from '../components/ui'
import { Icon } from '../components/AdminIcon'
import { getArticleSettings, type ArticleSettings } from '../lib/articles'
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

// Two densities for the same panel: roomy ("classic") and tight ("compact"). The choice is kept in this browser.
type Density = 'classic' | 'compact'
const DENSITY_KEY = 'hn-admin-density'
const readDensity = (): Density => { try { return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'classic' } catch { return 'classic' } }

function DensitySwitch({ density, onChange }: { density: Density; onChange: (d: Density) => void }) {
  return (
    <div className="ad-seg" role="group" aria-label="كثافة العرض">
      <button type="button" aria-pressed={density === 'classic'} onClick={() => onChange('classic')}>كلاسيكي</button>
      <button type="button" aria-pressed={density === 'compact'} onClick={() => onChange('compact')}>مضغوط</button>
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
  const [density, setDensity] = useState<Density>(readDensity)
  const changeDensity = (d: Density) => { setDensity(d); try { localStorage.setItem(DENSITY_KEY, d) } catch { /* storage blocked: the choice lasts until the page closes */ } }
  const reloadAuto = useCallback(() => { getArticleSettings().then(setAuto).catch(() => setAuto(null)) }, [])
  // One small read each time the panel opens a tab, so the status pill and the dashboard card are never stale.
  useEffect(() => { if (isAdmin) reloadAuto() }, [tab, isAdmin, reloadAuto])
  if (loading) return <Spinner label="جارٍ التحميل..." />
  if (!user || !isAdmin) return <Navigate to="/" replace />
  const current = ALL.find(([id]) => id === tab) ?? ALL[0]
  const group = GROUPS.find((g) => g.tabs.some(([id]) => id === current[0]))?.title ?? ''
  const Active = current[3] as () => React.ReactElement
  const chip = chipOf(auto)
  const tools = (
    <div className="ad-tools">
      {chip && <span className={`ad-chip ${chip.cls}`} role="status">{chip.text}</span>}
      <DensitySwitch density={density} onChange={changeDensity} />
    </div>
  )
  return (
    <div className={`ad ax${density === 'compact' ? ' ax-compact' : ''}`} dir="rtl" lang="ar" translate="no">
      <div className="ax-rail-wrap">
        <nav role="tablist" aria-label="أقسام لوحة التحكم" className="ax-rail">
          {GROUPS.map((g, gi) => (
            <Fragment key={g.title}>
              {gi > 0 && <span className="ax-sep" aria-hidden="true" />}
              {g.tabs.map(([id, label, icon]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="ax-tab"><Icon n={icon} />{label}</button>
              ))}
            </Fragment>
          ))}
        </nav>
      </div>
      <main className="ax-main">
        {tab === 'Dashboard'
          ? <Dashboard onGo={setTab} auto={auto} tools={tools} onAutoChanged={reloadAuto} />
          : (
            <>
              <div className="ad-top"><div><p className="ad-crumb">لوحة التحكم / {group}</p><h1>{current[1]}</h1></div>{tools}</div>
              <Active />
            </>
          )}
      </main>
    </div>
  )
}
