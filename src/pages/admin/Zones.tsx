import { useEffect, useState } from 'react'
import { doc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { adminWrite } from '../../lib/admin'
import { clearCache } from '../../lib/cache'
import { getZones } from '../../lib/catalog'
import { friendlyError } from '../../lib/errors'
import { ErrorBox, Spinner, btn, btnGhost, card, input } from '../../components/ui'
import type { Zone } from '../../lib/types'

const parseZips = (s: string) => Array.from(new Set(s.split(/[\s,]+/).filter((z) => /^[0-9]{5}$/.test(z))))

function Row({ zone, onSaved, onError }: { zone: Zone; onSaved: () => void; onError: (m: string) => void }) {
  const { user } = useAuth()
  const [z, setZ] = useState(zone)
  const [zips, setZips] = useState(zone.zips.join(', '))
  async function save() {
    if (!user) return
    const { id, ...data } = { ...z, zips: parseZips(zips) }
    try { await adminWrite(user.uid, 'update-zone', `zones/${id}`, (b) => b.set(doc(db, `zones/${id}`), data)); onSaved() } catch (e) { onError(friendlyError(e)) }
  }
  return (
    <li className={`${card} space-y-2`}>
      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="Zone name" className={`${input} w-64`} value={z.name} onChange={(e) => setZ({ ...z, name: e.target.value })} />
        <code className="text-xs text-gray-600">{z.id}</code>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={z.enabled} onChange={(e) => setZ({ ...z, enabled: e.target.checked })} /> Enabled</label>
      </div>
      <textarea aria-label="ZIP codes" rows={2} className={input} placeholder="ZIP codes (5 digits, comma or space separated)" value={zips} onChange={(e) => setZips(e.target.value)} />
      <button className={btnGhost} onClick={save}>Save</button>
    </li>
  )
}

export default function Zones() {
  const { user } = useAuth()
  const [zones, setZones] = useState<Zone[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const reload = () => { clearCache('zones'); getZones().then(setZones).catch((e) => setErr(friendlyError(e))) }
  useEffect(() => { getZones().then(setZones).catch((e) => setErr(friendlyError(e))) }, [])

  async function add() {
    if (!user || !/^[a-z0-9-]{2,60}$/.test(id) || !name.trim()) { setErr('Use a lowercase id and a name.'); return }
    try { await adminWrite(user.uid, 'create-zone', `zones/${id}`, (b) => b.set(doc(db, `zones/${id}`), { name: name.trim(), state: 'TX', city: 'Houston', zips: [], enabled: false })); setId(''); setName(''); reload() } catch (e) { setErr(friendlyError(e)) }
  }
  if (!zones) return err ? <ErrorBox message={err} /> : <Spinner />
  return (
    <div className="space-y-4">
      <ErrorBox message={err} />
      <div className="flex flex-wrap gap-2">
        <input aria-label="New zone id" className={`${input} w-48`} placeholder="new-zone-id" value={id} onChange={(e) => setId(e.target.value)} />
        <input aria-label="New zone name" className={`${input} w-56`} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className={btn} onClick={add}>Add zone (disabled by default)</button>
      </div>
      <ul className="space-y-3">{zones.map((z) => <Row key={z.id} zone={z} onSaved={reload} onError={setErr} />)}</ul>
    </div>
  )
}
