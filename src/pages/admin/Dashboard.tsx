import { useEffect, useState, type ReactNode } from 'react'
import { Timestamp, collection, doc, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { adminWrite } from '../../lib/admin'
import { cached, clearCache } from '../../lib/cache'
import { DEFAULT_CONFIG, getAppConfig } from '../../lib/catalog'
import { friendlyError } from '../../lib/errors'
import { callWorker, type ArticleSettings, type RunNowResult } from '../../lib/articles'
import { Pill, btn, btnGhost, card } from '../../components/ui'
import { Icon } from '../../components/AdminIcon'
import { nextRunIn } from '../../shared/articles'
import type { AppConfig } from '../../lib/types'

const SYSTEM: [keyof AppConfig, string, string][] = [
  ['signupOpen', 'التسجيل مفتوح', 'قبول تسجيل العملاء ومقدمي الخدمة الجدد'],
  ['maintenanceMode', 'وضع الصيانة', 'شريط تنبيه لكل المستخدمين وحماية حصة القراءة'],
  ['chatEnabled', 'الدردشة داخل التطبيق', 'التواصل المباشر بين العميل والعامل'],
  ['autoRulesEnabled', 'قواعد الاستخدام العادل التلقائية', 'تحرير وتأكيد تلقائي ومخالفات وتجميد'],
]
const ar = new Intl.NumberFormat('ar-EG')
const MODE_TEXT = { off: 'متوقف', draft: 'يحفظ مسودات للمراجعة', checked: 'ينشر بعد فحص الجودة', publish: 'ينشر مباشرة' } as const
const HOUR = 3_600_000
const PROJECT = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
const USAGE_URL = PROJECT ? `https://console.firebase.google.com/project/${PROJECT}/usage` : 'https://console.firebase.google.com/'

/** Arabic wording for the progress bar under the automation card. */
function nextRun(a: ArticleSettings, now = Date.now()): { pct: number; text: string } {
  const { intervalMs, leftMs, neverRan } = nextRunIn(a.everyDays, a.perDay, a.lastRunAt?.toDate().getTime() ?? 0, now)
  if (neverRan) return { pct: 100, text: 'في أقرب تشغيل (خلال ساعة تقريبًا)' }
  if (leftMs <= 0) return { pct: 100, text: 'مستحق الآن، يُكتب في التشغيل القادم (خلال ساعة)' }
  const h = Math.ceil(leftMs / HOUR)
  return { pct: Math.round((1 - leftMs / intervalMs) * 100), text: h <= 1 ? 'المقال القادم خلال ساعة تقريبًا' : `المقال القادم بعد نحو ${ar.format(h)} ساعات` }
}

interface Props { onGo?: (tab: string) => void; auto?: ArticleSettings | null; tools?: ReactNode; onAutoChanged?: () => void }

export default function Dashboard({ onGo, auto, tools, onAutoChanged }: Props) {
  const { user } = useAuth()
  const [c, setC] = useState<{ users: number; requests: number; reports: number } | null>(null)
  const [cfg, setCfg] = useState<AppConfig>(DEFAULT_CONFIG)
  const [err, setErr] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [pub, setPub] = useState<string | null>(null)
  useEffect(() => {
    const start = Timestamp.fromDate(new Date(new Date().setHours(0, 0, 0, 0)))
    // Kept 5 minutes in memory: switching admin tabs and coming back does not re-count.
    cached('admin:dash', 5 * 60_000, async () => {
      const [u, r, p] = await Promise.all([
        getCountFromServer(query(collection(db, 'users'), where('createdAt', '>=', start))),
        getCountFromServer(query(collection(db, 'requests'), where('createdAt', '>=', start))),
        getCountFromServer(query(collection(db, 'reports'), where('status', '==', 'open'))),
      ])
      return { users: u.data().count, requests: r.data().count, reports: p.data().count }
    }).then(setC).catch(() => setErr(true))
    getAppConfig().then(setCfg).catch(() => undefined)
  }, [])
  const go = (t: string) => onGo?.(t)
  const val = (v: number | undefined) => (err ? '-' : v == null ? '...' : ar.format(v))
  const next = auto && auto.mode !== 'off' ? nextRun(auto) : null
  const reports = c?.reports ?? 0

  /** Flips one system switch and saves it the same way the Settings tab does (the whole config document, read fresh first so nothing else is overwritten). */
  async function flip(k: keyof AppConfig, label: string) {
    if (!user || saving) return
    const turnOn = !cfg[k]
    if (k === 'maintenanceMode' && turnOn && !window.confirm('تفعيل وضع الصيانة؟ سيظهر شريط تنبيه لكل المستخدمين.')) return
    if (k === 'signupOpen' && !turnOn && !window.confirm('إغلاق التسجيل؟ لن يستطيع أحد إنشاء حساب جديد حتى تعيد فتحه.')) return
    setSaving(k); setNote(null)
    try {
      clearCache('config')
      const fresh = await getAppConfig()
      const upd = { ...fresh, [k]: turnOn }
      await adminWrite(user.uid, 'update-config', 'config/app', (b) => b.set(doc(db, 'config/app'), upd))
      clearCache('config')
      setCfg(upd)
      setNote({ ok: true, text: `${label}: ${turnOn ? 'تم التفعيل' : 'تم الإيقاف'}.` })
    } catch (e) { setNote({ ok: false, text: friendlyError(e) }) } finally { setSaving(null) }
  }

  async function publishNow() {
    setPub('جارٍ كتابة مقال الآن… قد يستغرق حتى دقيقة.')
    try {
      const r = await callWorker<RunNowResult>('/articles/run-now', {})
      setPub(r.ran ? `تم: المقال “${r.title}” ${r.published ? 'نُشر' : 'حُفظ كمسودة'}.` : r.reason === 'off' ? 'فعّل الكتابة التلقائية من إعدادات المقالات أولًا.' : `لم يُكتب شيء: ${r.reason}`)
      clearCache('admin:dash')
      onAutoChanged?.()
    } catch (e) { setPub(e instanceof Error ? e.message : friendlyError(e)) }
  }

  const kpis: [string, number | undefined, string, string, string | null][] = [
    ['مستخدمون جدد اليوم', c?.users, 'users', 'منذ منتصف الليل · اضغط للتفاصيل', 'Users'],
    ['طلبات جديدة اليوم', c?.requests, 'plus', 'منذ منتصف الليل', null],
    ['بلاغات مفتوحة', c?.reports, 'shield', reports > 0 ? 'في انتظار قرارك · اضغط للمراجعة' : 'لا يوجد ما ينتظر قرارك', 'Moderation'],
  ]
  const healthy = !cfg.maintenanceMode && cfg.signupOpen

  return (
    <div className="space-y-5">
      <section className="ax-banner" aria-label="ملخص اليوم">
        <div className="ax-banner-top">
          <div><p className="ad-crumb">لوحة التحكم / نظرة عامة</p><h1>لوحة المعلومات</h1></div>
          {tools}
        </div>
        <div className="ax-kpis">
          {kpis.map(([label, v, icon, sub, tab]) => {
            const inner = (
              <>
                <span><small>{label}</small><b>{val(v)}</b><small>{sub}</small></span>
                <span className="ad-ic"><Icon n={icon} /></span>
              </>
            )
            return tab
              ? <button key={label} type="button" className="ax-kpi" onClick={() => go(tab)}>{inner}</button>
              : <div key={label} className="ax-kpi">{inner}</div>
          })}
        </div>
      </section>

      <div className="ax-grid">
        <div className="ax-col">
          <section className={`${card} hn-in`} aria-label="بانتظار قرارك">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div><h2 className="text-lg">بانتظار قرارك</h2><p className="text-sm text-mu">أشياء تحتاج منك مراجعة سريعة</p></div>
              <Pill>أولويات العمليات</Pill>
            </div>
            <div className="ax-tiles">
              {([
                ['البلاغات', reports > 0 ? `${ar.format(reports)} مفتوح` : 'لا يوجد بلاغ مفتوح', reports > 0 ? 'بلاغات تحتاج قرارك' : 'لا يوجد بلاغ مفتوح حاليًا', 'Moderation', reports > 0 ? 'y' : 'g'],
                ['النزاعات', 'مراجعة', 'أعمال يطلب فيها أحد الطرفين قرارًا من الإدارة', 'Disputes', undefined],
                ['مستخدمون للمراجعة', 'مراجعة', 'حسابات وصلت إلى حد المخالفات', 'Users', undefined],
              ] as const).map(([name, badge, text, tab, tone]) => (
                <div key={name} className="ax-tile">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2"><Pill tone={tone as 'y' | 'g' | undefined}>{name}</Pill>{name === 'البلاغات' && <span className="text-xs font-bold text-mu">{badge}</span>}</div>
                    <p className="text-sm text-mu">{text}</p>
                  </div>
                  <button type="button" className={btnGhost} onClick={() => go(tab)}>مراجعة</button>
                </div>
              ))}
            </div>
          </section>

          <section className={`${card} hn-in`} aria-label="النشر التلقائي للمقالات">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg">النشر التلقائي للمقالات</h2>{auto && <Pill tone={auto.mode === 'off' ? 'r' : 'y'}>{MODE_TEXT[auto.mode]}</Pill>}</div>
                <p className="text-sm text-mu">كل ما يخص الكتابة التلقائية في مكان واحد</p>
              </div>
              <button type="button" className={btn} onClick={() => go('Articles')}>إعدادات المقالات</button>
            </div>
            {!auto ? <p className="text-sm text-mu">جارٍ التحميل...</p> : (
              <>
                <div className="ax-latest">
                  <div className="min-w-0">
                    <small className="block text-mu">آخر مقال نُشر تلقائيًا</small>
                    <b className="block text-sm">{auto.lastPublishedSlug ? <a className="ad-ltr underline" href={`/blog/${auto.lastPublishedSlug}`} target="_blank" rel="noreferrer">{auto.lastPublishedTitle || auto.lastPublishedSlug}</a> : 'لا يوجد بعد'}</b>
                  </div>
                  {auto.lastPublishedSlug && <a className={btnGhost} href={`/blog/${auto.lastPublishedSlug}`} target="_blank" rel="noreferrer">معاينة</a>}
                </div>
                <div className="ax-cells">
                  <div><small>المعدل</small><b>{auto.everyDays === 1 ? `${ar.format(auto.perDay)} مقالات يوميًا` : `${ar.format(auto.perDay)} كل ${ar.format(auto.everyDays)} أيام`}</b><small>في الطابور: {ar.format(auto.topics.length)} عنوانًا</small></div>
                  <div><small>وقت آخر نشر</small><b>{auto.lastPublishedAt ? auto.lastPublishedAt.toDate().toLocaleString('ar-EG') : '-'}</b></div>
                  <div><small>آخر محاولة من الجدول</small><b>{auto.lastRunAt ? auto.lastRunAt.toDate().toLocaleString('ar-EG') : 'لم يعمل بعد'}</b></div>
                </div>
                {auto.lastError && <p className="mt-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-tx" role="alert">فشل آخر تشغيل: <span className="ad-ltr">{auto.lastError}</span></p>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-mu">{next ? next.text : 'الكتابة التلقائية متوقفة. فعّلها من إعدادات المقالات.'}</p>
                  <button type="button" className={btnGhost} onClick={publishNow} disabled={auto.mode === 'off' || pub?.startsWith('جارٍ') === true}>نشر مقال الآن</button>
                </div>
                {next && <div className="ad-bar" role="progressbar" aria-valuenow={next.pct} aria-valuemin={0} aria-valuemax={100} aria-label="الوقت حتى المقال القادم"><i style={{ width: `${next.pct}%` }} /></div>}
                {pub && <p className="mt-2 text-sm text-ac" role="status">{pub}</p>}
              </>
            )}
          </section>
        </div>

        <div className="ax-col">
          <section className={`${card} hn-in`} aria-label="إعدادات النظام الفورية">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg">إعدادات النظام الفورية</h2>
                <p className={`text-sm font-bold ${healthy ? 'text-ok' : 'text-warn-tx'}`} role="status">{healthy ? 'جميع الخدمات تعمل بشكل طبيعي' : cfg.maintenanceMode ? 'وضع الصيانة مفعّل الآن' : 'التسجيل مغلق حاليًا'}</p>
              </div>
              <button type="button" className="text-sm font-bold text-ac underline" onClick={() => go('Settings')}>تعديل من الإعدادات</button>
            </div>
            <div>
              {SYSTEM.map(([k, label, hint]) => (
                <div key={k} className="ax-sys">
                  <div className="min-w-0"><b className="block text-sm">{label}</b><small>{hint}</small></div>
                  <button type="button" role="switch" aria-checked={Boolean(cfg[k])} aria-label={label} disabled={saving !== null} className={`hn-switch${cfg[k] ? ' on' : ''}`} onClick={() => flip(k, label)} />
                </div>
              ))}
            </div>
            {note && <p className={`mt-2 text-sm ${note.ok ? 'text-ac' : 'text-danger-tx'}`} role="status">{note.text}</p>}
          </section>

          <section className="hn-card ax-alert hn-in" aria-label="تنبيه استهلاك الخطة المجانية">
            <div className="flex items-start gap-3">
              <span className="ad-ic a" aria-hidden="true"><Icon n="clock" /></span>
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-base">تنبيه استهلاك الخطة المجانية</h2><span className="rounded-full bg-sf px-2 py-0.5 text-xs font-bold ad-ltr">Firebase Spark</span></div>
                <p className="text-sm">حدود الخطة المجانية (Spark) يومية وصارمة: القراءة والكتابة والحذف. عند تجاوزها تتوقف الخدمة حتى اليوم التالي. هذه الصفحة تستخدم استعلامات عدّ خفيفة ولا تستطيع قياس القراءات عندك.</p>
                <p className="text-sm opacity-90">راجع تبويب Usage في Firebase يوميًا خلال الإطلاق، وفكّر في تفعيل وضع الصيانة من الإعدادات إذا اقتربت من الحد.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className={btnGhost} href={USAGE_URL} target="_blank" rel="noreferrer">فحص استهلاك Firebase</a>
              <button type="button" className={btnGhost} disabled={cfg.maintenanceMode || saving !== null} onClick={() => flip('maintenanceMode', 'وضع الصيانة')}>{cfg.maintenanceMode ? 'الصيانة مفعّلة' : 'تفعيل الصيانة الآن'}</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
