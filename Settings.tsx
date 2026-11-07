import { useEffect, useState } from 'react'
import { doc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { adminWrite } from '../../lib/admin'
import { clearCache } from '../../lib/cache'
import { DEFAULT_CONFIG, getAppConfig } from '../../lib/catalog'
import { friendlyError } from '../../lib/errors'
import { ErrorBox, Field, btn, input } from '../../components/ui'
import type { AppConfig } from '../../lib/types'

const BOOLS: [keyof AppConfig, string][] = [
  ['signupOpen', 'Sign-ups open'], ['maintenanceMode', 'Maintenance mode (banner for all users)'], ['revealContactOnClaim', 'Reveal contact on claim'],
  ['chatEnabled', 'In-app chat enabled'], ['feesEnabled', 'Fees enabled (reserved, no payments are built)'],
]
const NUMS: [keyof AppConfig, string, number, number][] = [
  ['maxClaimsPerRequest', 'Max workers per request', 1, 10], ['requestExpiryHours', 'Request expiry (hours, max 160)', 1, 160],
  ['maxCategoriesPerWorker', 'Max services per worker (rules cap: 5)', 1, 5], ['maxZonesPerWorker', 'Max areas per worker (rules cap: 6)', 1, 6],
  ['freeRequestsPerClient', 'Free requests per client (reserved)', 0, 1000],
]

export default function Settings() {
  const { user } = useAuth()
  const [cfg, setCfg] = useState<AppConfig>(DEFAULT_CONFIG)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { clearCache('config'); getAppConfig().then(setCfg).catch((e) => setErr(friendlyError(e))) }, [])

  async function save() {
    if (!user) return
    setErr(null); setMsg(null)
    try {
      await adminWrite(user.uid, 'update-config', 'config/app', (b) => b.set(doc(db, 'config/app'), cfg))
      setMsg('Saved.')
    } catch (e) { setErr(friendlyError(e)) }
  }
  return (
    <div className="max-w-lg space-y-4">
      {BOOLS.map(([k, label]) => (
        <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(cfg[k])} onChange={(e) => setCfg({ ...cfg, [k]: e.target.checked })} /> {label}</label>
      ))}
      {NUMS.map(([k, label, min, max]) => (
        <Field key={k} label={label} htmlFor={k}><input id={k} type="number" min={min} max={max} className={input} value={Number(cfg[k])} onChange={(e) => setCfg({ ...cfg, [k]: Math.min(max, Math.max(min, Number(e.target.value) || min)) })} /></Field>
      ))}
      <ErrorBox message={err} />
      {msg && <p role="status" className="text-sm text-emerald-800">{msg}</p>}
      <button className={btn} onClick={save}>Save settings</button>
    </div>
  )
}
