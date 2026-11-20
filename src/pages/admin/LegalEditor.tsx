import { useEffect, useState } from 'react'
import { doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { adminWrite } from '../../lib/admin'
import { clearCache } from '../../lib/cache'
import { getLegal } from '../../lib/catalog'
import { friendlyError } from '../../lib/errors'
import { ErrorBox, Field, btn, input } from '../../components/ui'

const IDS = ['terms', 'privacy', 'guidelines', 'disclaimer']

export default function LegalEditor() {
  const { user } = useAuth()
  const [id, setId] = useState('terms')
  const [title, setTitle] = useState('')
  const [version, setVersion] = useState('')
  const [body, setBody] = useState('')
  const [isDraft, setIsDraft] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    clearCache(`legal:${id}`)
    getLegal(id).then((d) => { setTitle(d?.title ?? id); setVersion(d?.version ?? ''); setBody(d?.body ?? ''); setIsDraft(d?.isDraft ?? true) }).catch((e) => setErr(friendlyError(e)))
  }, [id])

  async function publish() {
    if (!user) return
    if (!version.trim()) { setErr('رقم الإصدار مطلوب.'); return }
    setErr(null); setMsg(null)
    try {
      await adminWrite(user.uid, 'publish-legal', `legal/${id}`, (b) => b.set(doc(db, `legal/${id}`), { title, version: version.trim(), body, isDraft, publishedAt: serverTimestamp() }))
      setMsg(id === 'terms' ? 'تم النشر. سيُطلب من كل المستخدمين قبول نسخة الشروط الجديدة في زيارتهم القادمة.' : 'تم النشر.')
    } catch (e) { setErr(friendlyError(e)) }
  }
  return (
    <div className="max-w-2xl space-y-3 hn-card">
      <Field label="المستند" htmlFor="doc"><select id="doc" dir="ltr" className={input} value={id} onChange={(e) => setId(e.target.value)}>{IDS.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="العنوان" htmlFor="t"><input id="t" dir="ltr" className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="الإصدار (غيّره لإجبار المستخدمين على إعادة قبول الشروط)" htmlFor="v"><input id="v" dir="ltr" className={input} value={version} onChange={(e) => setVersion(e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isDraft} onChange={(e) => setIsDraft(e.target.checked)} /> ما زال مسودة (يحتاج مراجعة محامٍ)</label>
      <Field label="النص" htmlFor="b"><textarea id="b" dir="ltr" rows={16} className={input} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <ErrorBox message={err} />
      {msg && <p role="status" className="text-sm text-ac">{msg}</p>}
      <button className={btn} onClick={publish}>نشر</button>
    </div>
  )
}
