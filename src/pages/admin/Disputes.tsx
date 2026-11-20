import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { listDisputes, resolveDispute, type DisputeOutcome } from '../../lib/discipline'
import { dollarsToCents, formatCents } from '../../lib/money'
import { friendlyError } from '../../lib/errors'
import { Empty, ErrorBox, Spinner, btn, btnGhost, card, input } from '../../components/ui'
import type { ClaimDoc } from '../../lib/types'

const key = (c: ClaimDoc) => `${c.requestId}_${c.workerId}`

/** Jobs either side asked an admin to decide. Oldest first. */
export default function Disputes() {
  const { user } = useAuth()
  const [rows, setRows] = useState<ClaimDoc[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [strike, setStrike] = useState<Record<string, 'worker' | 'client' | ''>>({})

  const load = () => listDisputes().then(setRows).catch((e) => { setErr(friendlyError(e)); setRows([]) })
  useEffect(() => { void load() }, [])

  async function decide(c: ClaimDoc, outcome: DisputeOutcome) {
    if (!user) return
    const k = key(c)
    const note = (notes[k] ?? '').trim()
    if (note.length < 3) { setErr('اكتب ملاحظة قصيرة عن قرارك (3 أحرف على الأقل). يراها الطرفان.'); return }
    let finalCents: number | undefined
    if (outcome === 'confirm') {
      const cents = dollarsToCents(amounts[k] ?? ((c.finalCents ?? c.quotedCents) / 100).toString())
      if (cents == null) { setErr('أدخل مبلغًا نهائيًا صحيحًا بالدولار.'); return }
      finalCents = cents
    }
    try {
      setErr(null)
      await resolveDispute(user.uid, c, outcome, { finalCents, note, strikeTo: strike[k] || null })
      await load()
    } catch (e) { setErr(friendlyError(e)) }
  }

  if (!rows) return <Spinner label="جارٍ التحميل..." />
  return (
    <div className="space-y-4">
      <p className="text-sm text-mu">أعمال أبلغ فيها أحد الطرفين عن مشكلة، أو قال فيها العميل "لم يُنجز بعد" مرات كثيرة. اتخذ قرارك واكتب ملاحظة قصيرة، ويمكنك إعطاء مخالفة للطرف المخطئ.</p>
      <ErrorBox message={err} />
      {rows.length === 0 && <Empty>لا توجد نزاعات مفتوحة.</Empty>}
      <ul className="space-y-3">
        {rows.map((c) => {
          const k = key(c)
          return (
            <li key={k} className={`${card} space-y-2 text-sm`}>
              <p><strong>{c.title}</strong> ({c.categoryName})</p>
              <p>العامل: {c.workerName} <code className="text-xs ad-ltr">{c.workerId}</code> &middot; العميل <code className="text-xs ad-ltr">{c.clientId}</code></p>
              <p>السعر المعروض {formatCents(c.quotedCents)}{c.finalCents != null ? <> &middot; السعر النهائي من العامل {formatCents(c.finalCents)}</> : null} &middot; "لم يُنجز بعد" {c.reopenCount ?? 0} مرة</p>
              <p className="text-tx">رفعه <strong>{c.disputeBy === 'worker' ? 'العامل' : c.disputeBy === 'client' ? 'العميل' : c.disputeBy}</strong>: {c.disputeReason}</p>
              <label className="block">ملاحظة القرار (يراها الطرفان)<input className={`${input} mt-1`} maxLength={300} value={notes[k] ?? ''} onChange={(e) => setNotes({ ...notes, [k]: e.target.value })} /></label>
              <label className="block">المبلغ النهائي إذا أكدت (بالدولار)<input className={`${input} mt-1`} inputMode="decimal" value={amounts[k] ?? ((c.finalCents ?? c.quotedCents) / 100).toString()} onChange={(e) => setAmounts({ ...amounts, [k]: e.target.value })} /></label>
              <label className="block">مخالفة للطرف المخطئ
                <select className={`${input} mt-1`} value={strike[k] ?? ''} onChange={(e) => setStrike({ ...strike, [k]: e.target.value as 'worker' | 'client' | '' })}>
                  <option value="">بدون مخالفة</option><option value="worker">العامل</option><option value="client">العميل</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <button className={btn} onClick={() => decide(c, 'confirm')}>تأكيد إنجاز العمل</button>
                <button className={btnGhost} onClick={() => decide(c, 'resume')}>إعادته للعمل</button>
                <button className={btnGhost} onClick={() => decide(c, 'cancel')}>إلغاء العمل</button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
