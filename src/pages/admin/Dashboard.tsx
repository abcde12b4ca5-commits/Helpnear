import { useEffect, useState } from 'react'
import { Timestamp, collection, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { DEFAULT_CONFIG, getAppConfig } from '../../lib/catalog'
import { Pill, Switch, btn, btnGhost, card } from '../../components/ui'
import { Icon } from '../../components/AdminIcon'
import type { ArticleSettings } from '../../lib/articles'
import { nextRunIn } from '../../shared/articles'
import type { AppConfig } from '../../lib/types'

const SYSTEM: [keyof AppConfig, string][] = [['signupOpen', 'التسجيل مفتوح'], ['maintenanceMode', 'وضع الصيانة'], ['chatEnabled', 'الدردشة داخل التطبيق'], ['autoRulesEnabled', 'قواعد الاستخدام العادل التلقائية']]
const ar = new Intl.NumberFormat('ar-EG')
const MODE_TEXT = { off: 'متوقف', draft: 'يحفظ مسودات للمراجعة', checked: 'ينشر بعد فحص الجودة', publish: 'ينشر مباشرة' } as const
const HOUR = 3_600_000

/** Arabic wording for the progress bar under the automation card. */
function nextRun(a: ArticleSettings, now = Date.now()): { pct: number; text: string } {
  const { intervalMs, leftMs, neverRan } = nextRunIn(a.everyDays, a.perDay, a.lastRunAt?.toDate().getTime() ?? 0, now)
  if (neverRan) return { pct: 100, text: 'في أقرب تشغيل (خلال ساعة تقريبًا)' }
  if (leftMs <= 0) return { pct: 100, text: 'مستحق الآن، يُكتب في التشغيل القادم (خلال ساعة)' }
  const h = Math.ceil(leftMs / HOUR)
  return { pct: Math.round((1 - leftMs / intervalMs) * 100), text: h <= 1 ? 'المقال القادم خلال ساعة تقريبًا' : `المقال القادم بعد نحو ${ar.format(h)} ساعات` }
}

export default function Dashboard({ onGo, auto }: { onGo?: (tab: string) => void; auto?: ArticleSettings | null }) {
  const [c, setC] = useState<{ users: number; requests: number; reports: number } | null>(null)
  const [cfg, setCfg] = useState<AppConfig>(DEFAULT_CONFIG)
  const [err, setErr] = useState(false)
  useEffect(() => {
    const start = Timestamp.fromDate(new Date(new Date().setHours(0, 0, 0, 0)))
    Promise.all([
      getCountFromServer(query(collection(db, 'users'), where('createdAt', '>=', start))),
      getCountFromServer(query(collection(db, 'requests'), where('createdAt', '>=', start))),
      getCountFromServer(query(collection(db, 'reports'), where('status', '==', 'open'))),
    ]).then(([u, r, p]) => setC({ users: u.data().count, requests: r.data().count, reports: p.data().count })).catch(() => setErr(true))
    getAppConfig().then(setCfg).catch(() => undefined)
  }, [])
  const items: [string, number | undefined, string, string, string][] = [['مستخدمون جدد اليوم', c?.users, 'users', '', 'منذ منتصف الليل'], ['طلبات جديدة اليوم', c?.requests, 'plus', 'a', 'منذ منتصف الليل'], ['بلاغات مفتوحة', c?.reports, 'shield', '', 'في انتظار قرارك']]
  const go = (t: string) => onGo?.(t)
  const val = (v: number | undefined) => (err ? '-' : v == null ? '...' : ar.format(v))
  const next = auto && auto.mode !== 'off' ? nextRun(auto) : null
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {items.map(([label, v, icon, tone, sub], i) => (
        <div key={label} className={`${card} ad-stat hn-in`} style={{ ['--i' as string]: i }}>
          <span className={`ad-ic ${tone}`}><Icon n={icon} /></span>
          <div><p className="font-display text-4xl font-extrabold leading-tight">{val(v)}</p><p className="text-sm text-mu">{label}</p><p className="text-xs text-mu">{sub}</p></div>
        </div>
      ))}
      <section className={`${card} hn-in lg:col-span-2`} style={{ ['--i' as string]: 3 }} aria-label="النشر التلقائي للمقالات">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg">النشر التلقائي للمقالات</h2><button className={btn} onClick={() => go('Articles')}>إعدادات المقالات</button></div>
        <p className="mb-4 text-sm text-mu">كل ما يخص الكتابة التلقائية في مكان واحد</p>
        {!auto ? <p className="text-sm text-mu">جارٍ التحميل...</p> : (
          <>
            <div className="ad-kv">
              <div><small>الوضع</small><b>{MODE_TEXT[auto.mode]}</b></div>
              <div><small>المعدل</small><b>{auto.everyDays === 1 ? `${ar.format(auto.perDay)} مقالات يوميًا` : `${ar.format(auto.perDay)} كل ${ar.format(auto.everyDays)} أيام`}</b></div>
              <div><small>آخر مقال نُشر تلقائيًا</small><b>{auto.lastPublishedSlug ? <a className="ad-ltr underline" href={`/blog/${auto.lastPublishedSlug}`} target="_blank" rel="noreferrer">{auto.lastPublishedTitle || auto.lastPublishedSlug}</a> : 'لا يوجد بعد'}</b></div>
              <div><small>وقت آخر نشر</small><b>{auto.lastPublishedAt ? auto.lastPublishedAt.toDate().toLocaleString('ar-EG') : '-'}</b></div>
              <div><small>في الطابور</small><b>{ar.format(auto.topics.length)} عنوانًا</b></div>
              <div><small>آخر محاولة من الجدول</small><b>{auto.lastRunAt ? auto.lastRunAt.toDate().toLocaleString('ar-EG') : 'لم يعمل بعد'}</b></div>
            </div>
            {auto.lastError && <p className="mt-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-tx" role="alert">فشل آخر تشغيل: <span className="ad-ltr">{auto.lastError}</span></p>}
            {next ? <><p className="mt-4 text-sm text-mu">{next.text}</p><div className="ad-bar" role="progressbar" aria-valuenow={next.pct} aria-valuemin={0} aria-valuemax={100} aria-label="الوقت حتى المقال القادم"><i style={{ width: `${next.pct}%` }} /></div></> : <p className="mt-4 text-sm text-mu">الكتابة التلقائية متوقفة. فعّلها من إعدادات المقالات.</p>}
          </>
        )}
      </section>
      <section className={`${card} hn-in`} style={{ ['--i' as string]: 4 }} aria-label="بانتظار قرارك">
        <h2 className="text-lg">بانتظار قرارك</h2>
        <p className="mb-2 text-sm text-mu">أشياء تحتاج منك مراجعة</p>
        {([['البلاغات', (c?.reports ?? 0) > 0 ? `${ar.format(c?.reports ?? 0)} مفتوح` : 'لا يوجد بلاغ مفتوح', 'Moderation', (c?.reports ?? 0) > 0 ? 'y' : 'g'], ['النزاعات', 'أعمال طلب فيها أحد الطرفين قرارًا من الإدارة', 'Disputes', undefined], ['مستخدمون للمراجعة', 'حسابات وصلت إلى حد المخالفات', 'Users', undefined]] as const).map(([name, text, tab, tone]) => (
          <div key={name} className="flex flex-wrap items-center gap-3 border-t border-ln py-3">
            <Pill tone={tone as 'y' | 'g' | undefined}>{name}</Pill><span className="min-w-0 flex-1 text-sm text-mu">{text}</span>
            <button className={btnGhost} onClick={() => go(tab)}>مراجعة</button>
          </div>
        ))}
      </section>
      <aside className={`${card} hn-in space-y-3`} style={{ ['--i' as string]: 5 }} aria-label="حالة النظام">
        <h2 className="text-lg">النظام</h2>
        {SYSTEM.map(([k, label]) => <div key={k} className="flex items-center justify-between gap-3 text-sm"><span>{label}</span><Switch on={Boolean(cfg[k])} label={label} /></div>)}
        <button className={btnGhost} onClick={() => go('Settings')}>تعديل من الإعدادات</button>
      </aside>
      <p className="rounded-xl bg-warn-bg p-3 text-sm text-warn-tx lg:col-span-2">
        حدود الخطة المجانية (Spark) يومية وصارمة: القراءة والكتابة والحذف. عند تجاوزها تتوقف الخدمة حتى اليوم التالي. هذه الصفحة تستخدم استعلامات عدّ خفيفة ولا تستطيع قياس القراءات عندك. راجع تبويب Usage في Firebase يوميًا خلال الإطلاق، وفكّر في تفعيل وضع الصيانة من الإعدادات إذا اقتربت من الحد.
      </p>
    </div>
  )
}
