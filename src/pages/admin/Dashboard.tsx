import { useEffect, useState } from 'react'
import { Timestamp, collection, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { DEFAULT_CONFIG, getAppConfig } from '../../lib/catalog'
import { Pill, Switch, btnGhost, card } from '../../components/ui'
import { Icon } from '../../components/AdminIcon'
import type { AppConfig } from '../../lib/types'

const SYSTEM: [keyof AppConfig, string][] = [['signupOpen', 'التسجيل مفتوح'], ['maintenanceMode', 'وضع الصيانة'], ['chatEnabled', 'الدردشة داخل التطبيق'], ['autoRulesEnabled', 'قواعد الاستخدام العادل التلقائية']]
const ar = new Intl.NumberFormat('ar-EG')

export default function Dashboard({ onGo }: { onGo?: (tab: string) => void }) {
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
  const items: [string, number | undefined, string, string][] = [['مستخدمون جدد اليوم', c?.users, 'users', 'منذ منتصف الليل'], ['طلبات جديدة اليوم', c?.requests, 'plus', 'منذ منتصف الليل'], ['بلاغات مفتوحة', c?.reports, 'shield', 'في انتظار قرارك']]
  const go = (t: string) => onGo?.(t)
  const val = (v: number | undefined) => (err ? '-' : v == null ? '...' : ar.format(v))
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {items.map(([label, v, icon, sub], i) => (
        <div key={label} className={`${card} ad-stat hn-in`} style={{ ['--i' as string]: i }}>
          <p className="flex items-center gap-2 text-sm font-semibold text-mu"><span className="ad-ic"><Icon n={icon} /></span>{label}</p>
          <p className="mt-2 font-display text-5xl font-extrabold">{val(v)}</p>
          <p className="text-xs text-mu">{sub}</p>
        </div>
      ))}
      <section className={`${card} hn-in space-y-1 lg:col-span-2`} style={{ ['--i' as string]: 3 }}>
        <h2 className="mb-2 text-xl">بانتظار قرارك</h2>
        {([['البلاغات', (c?.reports ?? 0) > 0 ? `${ar.format(c?.reports ?? 0)} مفتوح` : 'لا يوجد بلاغ مفتوح', 'Moderation', (c?.reports ?? 0) > 0 ? 'y' : 'g'], ['النزاعات', 'أعمال طلب فيها أحد الطرفين قرارًا من الإدارة', 'Disputes', undefined], ['مستخدمون للمراجعة', 'حسابات وصلت إلى حد المخالفات', 'Users', undefined]] as const).map(([name, text, tab, tone]) => (
          <div key={name} className="flex flex-wrap items-center gap-3 border-t border-ln py-3">
            <Pill tone={tone as 'y' | 'g' | undefined}>{name}</Pill><span className="min-w-0 flex-1 text-sm text-mu">{text}</span>
            <button className={btnGhost} onClick={() => go(tab)}>مراجعة</button>
          </div>
        ))}
      </section>
      <aside className={`${card} hn-in space-y-3`} style={{ ['--i' as string]: 4 }} aria-label="حالة النظام">
        <h2 className="text-lg">النظام</h2>
        {SYSTEM.map(([k, label]) => <div key={k} className="flex items-center justify-between gap-3 text-sm"><span>{label}</span><Switch on={Boolean(cfg[k])} label={label} /></div>)}
        <button className={btnGhost} onClick={() => go('Settings')}>تعديل من الإعدادات</button>
      </aside>
      <p className="rounded-xl bg-warn-bg p-3 text-sm text-warn-tx lg:col-span-3">
        حدود الخطة المجانية (Spark) يومية وصارمة: القراءة والكتابة والحذف. عند تجاوزها تتوقف الخدمة حتى اليوم التالي. هذه الصفحة تستخدم استعلامات عدّ خفيفة ولا تستطيع قياس القراءات عندك. راجع تبويب Usage في Firebase يوميًا خلال الإطلاق، وفكّر في تفعيل وضع الصيانة من الإعدادات إذا اقتربت من الحد.
      </p>
    </div>
  )
}
