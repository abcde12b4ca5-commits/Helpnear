import { useEffect, useState } from 'react'
import { doc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { adminWrite } from '../../lib/admin'
import { clearCache } from '../../lib/cache'
import { DEFAULT_CONFIG, getAppConfig } from '../../lib/catalog'
import { friendlyError } from '../../lib/errors'
import { runPolicyNow } from '../../lib/discipline'
import { ErrorBox, Field, btn, btnGhost, input } from '../../components/ui'
import type { AppConfig } from '../../lib/types'

const BOOLS: [keyof AppConfig, string][] = [
  ['signupOpen', 'التسجيل مفتوح'], ['maintenanceMode', 'وضع الصيانة (شريط تنبيه لكل المستخدمين)'], ['revealContactOnClaim', 'إظهار بيانات التواصل عند قبول العامل للطلب'],
  ['chatEnabled', 'الدردشة داخل التطبيق مفعّلة'], ['feesEnabled', 'الرسوم مفعّلة (محجوزة للمستقبل، لا توجد مدفوعات)'],
  ['autoRulesEnabled', 'قواعد الاستخدام العادل التلقائية مفعّلة (تحرير وتأكيد تلقائي ومخالفات وتجميد)'],
  ['noResponseStrikes', 'العامل الذي يقبل الطلب ولا يتفق على سعر في الوقت المحدد يحصل على مخالفة'],
]
const NUMS: [keyof AppConfig, string, number, number][] = [
  ['maxWorkersPerRequest', 'أقصى عدد عمّال يطلبهم العميل (الحد في القواعد: 10)', 1, 10], ['requestExpiryHours', 'مدة صلاحية الطلب (بالساعات، الحد 160)', 1, 160],
  ['maxCategoriesPerWorker', 'أقصى عدد خدمات لكل عامل (الحد في القواعد: 5)', 1, 5],
  ['freeRequestsPerClient', 'الطلبات المجانية لكل عميل (محجوزة)', 0, 1000],
  ['penaltyWindowDays', 'الاستخدام العادل: عدد الأيام التي تُحسب فيها المخالفات', 7, 180],
  ['clientFreezeAt', 'الاستخدام العادل: مخالفات العميل التي توقف نشر الطلبات', 1, 20], ['clientReviewAt', 'الاستخدام العادل: مخالفات العميل التي تحوّل الحساب للمراجعة', 1, 50],
  ['workerFreezeAt', 'الاستخدام العادل: مخالفات العامل التي توقف قبول الطلبات', 1, 20], ['workerReviewAt', 'الاستخدام العادل: مخالفات العامل التي تحوّل الحساب للمراجعة', 1, 50],
  ['freezeDays', 'الاستخدام العادل: عدد أيام تجميد الحساب', 1, 90],
  ['noResponseHours', 'الاستخدام العادل: تحرير العامل الذي لم يتفق على سعر بعد (ساعات)', 1, 720],
  ['autoConfirmDays', 'الاستخدام العادل: تأكيد العمل "المنجز" تلقائيًا بعد (أيام صمت العميل)', 1, 60],
  ['disputeAfterReopens', 'الاستخدام العادل: عدد مرات "لم يُنجز بعد" التي تحوّل العمل إلى نزاع', 1, 10],
]

export default function Settings() {
  const { user } = useAuth()
  const [cfg, setCfg] = useState<AppConfig>(DEFAULT_CONFIG)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { clearCache('config'); getAppConfig().then(setCfg).catch((e) => setErr(friendlyError(e))) }, [])

  async function runNow() {
    setErr(null); setMsg(null)
    try {
      const r = await runPolicyNow()
      setMsg(r.disabled ? 'القواعد التلقائية متوقفة (احفظ الإعداد أولًا).' : `تم. تأكيد تلقائي: ${r.autoConfirmed}، تحرير: ${r.released}، مخالفات جديدة: ${r.strikes}، تجميد: ${r.frozen}، للمراجعة: ${r.flagged}${r.stoppedEarly ? ' (توقف مبكرًا، والباقي في المرة القادمة)' : ''}.`)
    } catch (e) { setErr(e instanceof Error ? e.message : friendlyError(e)) }
  }

  async function save() {
    if (!user) return
    setErr(null); setMsg(null)
    try {
      await adminWrite(user.uid, 'update-config', 'config/app', (b) => b.set(doc(db, 'config/app'), cfg))
      setMsg('تم الحفظ.')
    } catch (e) { setErr(friendlyError(e)) }
  }
  return (
    <div className="max-w-xl space-y-4 hn-card">
      {BOOLS.map(([k, label]) => (
        <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(cfg[k])} onChange={(e) => setCfg({ ...cfg, [k]: e.target.checked })} /> {label}</label>
      ))}
      {NUMS.map(([k, label, min, max]) => (
        <Field key={k} label={label} htmlFor={k}><input id={k} type="number" min={min} max={max} className={input} value={Number(cfg[k])} onChange={(e) => setCfg({ ...cfg, [k]: Math.min(max, Math.max(min, Number(e.target.value) || min)) })} /></Field>
      ))}
      <ErrorBox message={err} />
      {msg && <p role="status" className="text-sm text-ac">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={save}>حفظ الإعدادات</button>
        <button className={btnGhost} onClick={runNow}>تشغيل قواعد الاستخدام العادل الآن</button>
      </div>
    </div>
  )
}
