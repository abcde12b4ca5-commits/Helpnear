import { useEffect, useRef, useState, type FormEvent } from 'react'
import { collection, getDocs, limit, orderBy, query, where, type Timestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { setUserSuspended } from '../../lib/admin'
import { getAppConfig } from '../../lib/catalog'
import { banAndVoid, escalate, freezeUser, getUserStrikes, removeStrike, unfreezeUser } from '../../lib/discipline'
import { friendlyError } from '../../lib/errors'
import { Empty, ErrorBox, Spinner, btn, btnGhost, input } from '../../components/ui'
import type { StrikeDoc, UserDoc } from '../../lib/types'

type Row = UserDoc & { id: string; createdAt?: Timestamp }
type Mode = 'recent' | 'flagged' | 'search'
type RoleFilter = 'all' | 'worker' | 'client'

const when = (t: { toDate(): Date } | null | undefined) => (t ? t.toDate().toLocaleString('ar-EG') : '-')
const day = (t: { toDate(): Date } | null | undefined) => (t ? t.toDate().toLocaleDateString('ar-EG') : '-')

const toRows = (s: Awaited<ReturnType<typeof getDocs>>) => s.docs.map((d) => ({ ...(d.data() as UserDoc), id: d.id })) as Row[]
const fetchRows = async (mode: Mode, search: string) => {
  const users = collection(db, 'users')
  const q = mode === 'flagged' ? query(users, where('needsReview', '==', true), limit(20))
    : mode === 'search' && search ? query(users, where('email', '==', search.toLowerCase()), limit(1))
      : query(users, orderBy('createdAt', 'desc'), limit(20))
  return toRows(await getDocs(q))
}

/** The one-word status shown in the table and at the top of the side panel. */
function statusOf(r: Row, now: number): { text: string; cls: string } {
  if (r.status === 'suspended') return { text: 'موقوف', cls: 'r' }
  if (r.frozenUntil && r.frozenUntil.toMillis() > now) return { text: 'مجمّد', cls: 'r' }
  if (r.needsReview) return { text: 'للمراجعة', cls: 'w' }
  return { text: 'نشط', cls: 'g' }
}
const roleText = (r: Row) => (r.role === 'worker' ? 'مقدّم خدمة' : 'عميل')

export default function Users() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [mode, setMode] = useState<Mode>('recent')
  const [role, setRole] = useState<RoleFilter>('all')
  const [email, setEmail] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [freezeDays, setFreezeDays] = useState(7)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [strikes, setStrikes] = useState<Record<string, StrikeDoc[]>>({})
  const [now] = useState(() => Date.now())
  const panel = useRef<HTMLElement>(null)
  // What the list is currently showing, so that after an action it is refreshed the same way (search term included).
  const view = useRef<{ mode: Mode; q: string }>({ mode: 'recent', q: '' })

  useEffect(() => {
    getAppConfig().then((c) => setFreezeDays(c.freezeDays)).catch(() => undefined)
    fetchRows('recent', '').then(setRows).catch((e) => { setErr(friendlyError(e)); setRows([]) })
  }, [])

  async function load(m: Mode, q = '') {
    try { setErr(null); setMsg(null); view.current = { mode: m, q }; setMode(m); setRows(await fetchRows(m, q)) } catch (er) { setErr(friendlyError(er)) }
  }
  const search = (e: FormEvent) => { e.preventDefault(); void load(email.trim() ? 'search' : 'recent', email.trim()) }
  const toggleFlagged = () => void load(mode === 'flagged' ? 'recent' : 'flagged')

  async function act(r: Row, fn: () => Promise<string | void>) {
    if (!user) return
    try {
      setErr(null); setMsg(null)
      const out = await fn()
      if (out) setMsg(out)
      setRows(await fetchRows(view.current.mode, view.current.q))
      if (strikes[r.id]) setStrikes({ ...strikes, [r.id]: await getUserStrikes(r.id) })
    } catch (e) { setErr(friendlyError(e)) }
  }
  async function toggleStrikes(r: Row) {
    if (strikes[r.id]) { const { [r.id]: _gone, ...rest } = strikes; void _gone; setStrikes(rest); return }
    try { setStrikes({ ...strikes, [r.id]: await getUserStrikes(r.id) }) } catch (e) { setErr(friendlyError(e)) }
  }
  function pick(id: string) {
    setSel(id); setMsg(null); setErr(null)
    // On a phone the side panel sits under the table: bring it into view.
    if (window.matchMedia('(max-width: 1199px)').matches) requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  if (!rows) return <Spinner label="جارٍ التحميل..." />
  const shown = rows.filter((r) => role === 'all' || r.role === role)
  const active = shown.find((r) => r.id === sel) ?? shown[0]
  const count = (k: RoleFilter) => (k === 'all' ? rows.length : rows.filter((r) => r.role === k).length)
  const reason = active ? reasons[active.id] ?? '' : ''
  const frozen = active?.frozenUntil && active.frozenUntil.toMillis() > now

  return (
    <div className="space-y-4">
      <div className="ux-bar">
        <div className="ad-seg" role="group" aria-label="تصفية حسب نوع الحساب">
          {([['all', 'الكل'], ['worker', 'مقدّم خدمة'], ['client', 'عميل']] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={role === k} onClick={() => setRole(k)}>{label} ({ar(count(k))})</button>
          ))}
        </div>
        <form onSubmit={search} className="ux-search">
          <input aria-label="البريد الإلكتروني بالضبط" type="email" dir="ltr" className={`${input} min-w-0 flex-1`} placeholder="ابحث بالبريد الإلكتروني بالضبط (فارغ = آخر 20)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className={btn}>بحث</button>
        </form>
        <button type="button" className={btnGhost} aria-pressed={mode === 'flagged'} onClick={toggleFlagged}>{mode === 'flagged' ? 'عرض آخر الحسابات' : 'عرض الحسابات المحوّلة للمراجعة'}</button>
      </div>
      <ErrorBox message={err} />
      {msg && <p role="status" className="text-sm text-ac">{msg}</p>}
      {shown.length === 0 && <Empty>لم يتم العثور على مستخدمين.</Empty>}
      {shown.length > 0 && active && (
        <div className="ux-split">
          <div className="ux-table">
            <div className="ux-table-h"><span>قائمة المستخدمين (اختر حسابًا لإدارته)</span><span className="text-mu">{ar(shown.length)} حسابات</span></div>
            <div className="overflow-x-auto">
              <table>
                <thead><tr><th>المستخدم</th><th>الدور</th><th>الحالة</th><th>انضم في</th></tr></thead>
                <tbody>
                  {shown.map((r) => {
                    const st = statusOf(r, now)
                    return (
                      <tr key={r.id} aria-selected={r.id === active.id} onClick={() => pick(r.id)}>
                        <td><button type="button" className="ux-who" aria-pressed={r.id === active.id} onClick={(e) => { e.stopPropagation(); pick(r.id) }}><b>{r.displayName || '—'}</b><span className="ad-ltr">{r.email}</span></button></td>
                        <td><span className="ux-b">{roleText(r)}</span></td>
                        <td><span className={`ux-b ${st.cls}`}>{st.text}</span></td>
                        <td className="whitespace-nowrap">{day(r.createdAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <aside ref={panel} className="ux-ins" aria-label="لوحة فحص الحساب المحدد">
            <div className="flex items-start justify-between gap-3 border-b border-ln pb-3">
              <div className="min-w-0">
                <small className="block font-bold text-mu">لوحة فحص الحساب المحدد</small>
                <h2 className="text-lg">{active.displayName || '—'}</h2>
                <span className="ad-ltr block break-all text-sm text-mu">{active.email}</span>
              </div>
              <span className={`ux-b ${statusOf(active, now).cls}`}>{statusOf(active, now).text}</span>
            </div>
            <dl className="ux-facts">
              <div><dt>UID</dt><dd className="ad-ltr select-all break-all">{active.id}</dd></div>
              <div><dt>نوع الحساب</dt><dd>{active.role === 'worker' ? 'مقدّم خدمة (worker)' : 'عميل (client)'}</dd></div>
              <div><dt>تاريخ الانضمام</dt><dd>{day(active.createdAt)}</dd></div>
              {frozen && <div><dt>مجمّد حتى</dt><dd>{when(active.frozenUntil)}{active.frozenReason ? `: ${active.frozenReason}` : ''}</dd></div>}
              {active.needsReview && <div><dt>للمراجعة</dt><dd>{active.reviewReason || 'وصل إلى حد المخالفات'}</dd></div>}
            </dl>
            <label className="block text-sm font-bold">السبب أو الملاحظة (تُستخدم في التصعيد والتجميد)
              <textarea rows={2} maxLength={200} className={`${input} mt-1 font-normal`} placeholder="أدخل سبب الإجراء الإداري..." value={reason} onChange={(e) => setReasons({ ...reasons, [active.id]: e.target.value })} />
            </label>
            <div className="ux-actions">
              <button type="button" className={btnGhost} onClick={() => user && act(active, () => setUserSuspended(user.uid, active.id, active.role, active.status === 'active'))}>{active.status === 'active' ? 'إيقاف' : 'إلغاء الإيقاف'}</button>
              <button type="button" className={`${btnGhost} ux-warn`} onClick={() => user && act(active, () => escalate(user.uid, active.id, active.role, reason))}>تصعيد (إنذار، تجميد، حظر)</button>
              <div className="ux-freeze">
                <button type="button" className={btnGhost} onClick={() => user && act(active, async () => { await freezeUser(user.uid, active.id, freezeDays, reason || 'حد الاستخدام العادل'); return `تم التجميد لمدة ${freezeDays} يومًا.` })}>تجميد بالأيام</button>
                <input aria-label="أيام التجميد" type="number" min={1} max={90} className={`${input} w-20 text-center`} value={freezeDays} onChange={(e) => setFreezeDays(Math.min(90, Math.max(1, Number(e.target.value) || 1)))} />
              </div>
              {(frozen || active.needsReview) && <button type="button" className={`${btnGhost} col-span-2`} onClick={() => user && act(active, async () => { await unfreezeUser(user.uid, active.id); return 'تم رفع التجميد وعلامة المراجعة.' })}>رفع التجميد / إلغاء المراجعة</button>}
              <button type="button" className={btnGhost} aria-expanded={Boolean(strikes[active.id])} onClick={() => toggleStrikes(active)}>المخالفات{strikes[active.id] ? ` (${ar(strikes[active.id].length)})` : ''}</button>
              <button type="button" className={`${btnGhost} ad-danger`} onClick={() => {
                if (user && window.confirm(`حظر ${active.email}${active.role === 'worker' ? ' وإزالة كل أعماله المؤكدة من الأرباح' : ''}؟ استخدم هذا للاحتيال فقط.`)) {
                  void act(active, async () => `تم الحظر.${active.role === 'worker' ? ` أُزيلت ${await banAndVoid(user.uid, active.id, active.role)} أعمال مؤكدة.` : ''}`)
                }
              }}>حظر (احتيال)</button>
            </div>
            {strikes[active.id] && (
              <ul className="space-y-1 rounded-xl bg-bg p-2 text-sm">
                {strikes[active.id].length === 0 && <li className="text-mu">لا توجد مخالفات.</li>}
                {strikes[active.id].map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span>{when(s.createdAt)} &middot; <strong>{s.type}</strong> &middot; {s.by}{s.note ? ` \u00b7 ${s.note}` : ''}</span>
                    <button type="button" className={btnGhost} onClick={() => user && act(active, async () => { await removeStrike(user.uid, s.id); return 'تمت إزالة المخالفة.' })}>إزالة</button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

const ar = (n: number) => new Intl.NumberFormat('ar-EG').format(n)
