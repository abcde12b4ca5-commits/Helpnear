import { useEffect, useState } from 'react'
import { doc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { adminWrite } from '../../lib/admin'
import { clearCache } from '../../lib/cache'
import { getCategories } from '../../lib/catalog'
import { friendlyError } from '../../lib/errors'
import { ErrorBox, Spinner, btn, btnGhost, card, input } from '../../components/ui'
import type { Category } from '../../lib/types'
import starter from '../../config/starter-categories.json'

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
const states = (s: string) => [...new Set(s.split(/[ ,]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)))]
const words = (s: string) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)
const blank = (id: string, name: string): Category => ({ id, name, enabled: false, riskLevel: 'low', requiresLicenseCheck: false, allowedServices: [], blockedKeywords: [], notes: '', disabledStates: [] })

function Row({ cat, onSaved, onError }: { cat: Category; onSaved: () => void; onError: (m: string) => void }) {
  const { user } = useAuth()
  const [c, setC] = useState(cat)
  const [services, setServices] = useState(cat.allowedServices.join('\n'))
  const [blocked, setBlocked] = useState(cat.blockedKeywords.join(', '))
  const [off, setOff] = useState((cat.disabledStates ?? []).join(', '))
  const locked = c.riskLevel !== 'low' || c.requiresLicenseCheck // can only be enabled after a license-verification feature exists
  async function save() {
    if (!user) return
    const { id, ...data } = { ...c, enabled: locked ? false : c.enabled, allowedServices: lines(services), blockedKeywords: words(blocked), disabledStates: states(off) }
    try { await adminWrite(user.uid, 'update-category', `categories/${id}`, (b) => b.set(doc(db, `categories/${id}`), data)); onSaved() } catch (e) { onError(friendlyError(e)) }
  }
  return (
    <li className={`${card} space-y-2`}>
      <div className="flex flex-wrap items-center gap-3">
        <strong className="text-sm">{c.name}</strong><code className="text-xs text-mu ad-ltr">{c.id}</code>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" disabled={locked} checked={c.enabled && !locked} onChange={(e) => setC({ ...c, enabled: e.target.checked })} /> مفعّلة</label>
        <select aria-label="مستوى الخطورة" dir="ltr" className={`${input} w-auto`} value={c.riskLevel} onChange={(e) => setC({ ...c, riskLevel: e.target.value as Category['riskLevel'] })}>
          <option value="low">منخفض</option><option value="regulated">منظَّم (يحتاج ترخيصًا)</option><option value="high">مرتفع</option>
        </select>
      </div>
      {locked && <p className="text-xs text-warn-tx">لا يمكن تفعيلها حتى تتوفر ميزة التحقق من التراخيص.</p>}
      <textarea aria-label="الخدمات المسموحة، واحدة في كل سطر" dir="ltr" rows={3} className={input} value={services} onChange={(e) => setServices(e.target.value)} />
      <input aria-label="الكلمات المحظورة، مفصولة بفواصل" dir="ltr" className={input} placeholder="الكلمات المحظورة، مفصولة بفواصل" value={blocked} onChange={(e) => setBlocked(e.target.value)} />
      <input aria-label="الولايات التي تتوقف فيها هذه الخدمة" dir="ltr" className={input} placeholder="الولايات التي تتوقف فيها الخدمة، مثل NY, CA (فارغ = متاحة في كل مكان)" value={off} onChange={(e) => setOff(e.target.value)} />
      <input aria-label="ملاحظات" className={input} placeholder="ملاحظات" value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} />
      <button className={btnGhost} onClick={save}>حفظ</button>
    </li>
  )
}

export default function Categories() {
  const { user } = useAuth()
  const [cats, setCats] = useState<Category[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')
  const reload = () => { clearCache('categories'); getCategories().then(setCats).catch((e) => setErr(friendlyError(e))) }
  useEffect(() => { getCategories().then(setCats).catch((e) => setErr(friendlyError(e))) }, [])

  async function add() {
    if (!user || !/^[a-z0-9-]{2,60}$/.test(newId) || !newName.trim()) { setErr('استخدم معرّفًا بحروف إنجليزية صغيرة (حروف وأرقام وشرطات) واسمًا.'); return }
    const { id, ...data } = blank(newId, newName.trim())
    try { await adminWrite(user.uid, 'create-category', `categories/${id}`, (b) => b.set(doc(db, `categories/${id}`), data)); setNewId(''); setNewName(''); reload() } catch (e) { setErr(friendlyError(e)) }
  }
  const [info, setInfo] = useState<string | null>(null)
  const missing = cats ? (starter as Category[]).filter((s) => !cats.some((c) => c.id === s.id)) : []
  async function addMissing() {
    if (!user || missing.length === 0) return
    setErr(null); setInfo(null)
    try {
      await adminWrite(user.uid, 'add-starter-services', `categories/(${missing.length})`, (b) => missing.forEach(({ id, ...data }) => b.set(doc(db, `categories/${id}`), data)))
      setInfo(`تمت إضافة ${missing.length} خدمة.`); reload()
    } catch (e) { setErr(friendlyError(e)) }
  }
  if (!cats) return err ? <ErrorBox message={err} /> : <Spinner label="جارٍ التحميل..." />
  return (
    <div className="space-y-4">
      <ErrorBox message={err} />
      {missing.length > 0 && (
        <div className={`${card} space-y-2`}>
          <p className="text-sm"><strong>{missing.length} خدمة قياسية غير موجودة في قاعدة بياناتك بعد</strong>: {missing.map((m) => m.name).join(', ')}.</p>
          <button className={btn} onClick={addMissing}>إضافة الخدمات الناقصة ({missing.length})</button>
        </div>
      )}
      {info && <p className="text-sm text-ok" role="status">{info}</p>}
      <div className="flex flex-wrap gap-2">
        <input aria-label="معرّف الخدمة الجديدة" dir="ltr" className={`${input} w-48`} placeholder="new-category-id" value={newId} onChange={(e) => setNewId(e.target.value)} />
        <input aria-label="اسم الخدمة الجديدة" dir="ltr" className={`${input} w-56`} placeholder="الاسم" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className={btn} onClick={add}>إضافة خدمة (تكون متوقفة افتراضيًا)</button>
      </div>
      <ul className="space-y-3">{cats.map((c) => <Row key={c.id} cat={c} onSaved={reload} onError={setErr} />)}</ul>
    </div>
  )
}
