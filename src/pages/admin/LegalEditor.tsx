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
    if (!version.trim()) { setErr('Version is required.'); return }
    setErr(null); setMsg(null)
    try {
      await adminWrite(user.uid, 'publish-legal', `legal/${id}`, (b) => b.set(doc(db, `legal/${id}`), { title, version: version.trim(), body, isDraft, publishedAt: serverTimestamp() }))
      setMsg(id === 'terms' ? 'Published. All users must accept this new Terms version on their next visit.' : 'Published.')
    } catch (e) { setErr(friendlyError(e)) }
  }
  return (
    <div className="max-w-2xl space-y-3">
      <Field label="Document" htmlFor="doc"><select id="doc" className={input} value={id} onChange={(e) => setId(e.target.value)}>{IDS.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Title" htmlFor="t"><input id="t" className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Version (change it to force re-acceptance of Terms)" htmlFor="v"><input id="v" className={input} value={version} onChange={(e) => setVersion(e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isDraft} onChange={(e) => setIsDraft(e.target.checked)} /> Still a draft (needs attorney review)</label>
      <Field label="Text" htmlFor="b"><textarea id="b" rows={16} className={input} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <ErrorBox message={err} />
      {msg && <p role="status" className="text-sm text-ac">{msg}</p>}
      <button className={btn} onClick={publish}>Publish</button>
    </div>
  )
}
