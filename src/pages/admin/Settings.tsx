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
  ['signupOpen', 'Sign-ups open'], ['maintenanceMode', 'Maintenance mode (banner for all users)'], ['revealContactOnClaim', 'Reveal contact when a worker accepts'],
  ['chatEnabled', 'In-app chat enabled'], ['feesEnabled', 'Fees enabled (reserved, no payments are built)'],
  ['autoRulesEnabled', 'Automatic fair-use rules ON (scheduled worker: auto-release, auto-confirm, strikes and freezes)'],
  ['noResponseStrikes', 'A worker who accepts and never agrees a price in time gets a strike'],
]
const NUMS: [keyof AppConfig, string, number, number][] = [
  ['maxWorkersPerRequest', 'Max workers a client can ask for (rules cap: 10)', 1, 10], ['requestExpiryHours', 'Request expiry (hours, max 160)', 1, 160],
  ['maxCategoriesPerWorker', 'Max services per worker (rules cap: 5)', 1, 5],
  ['freeRequestsPerClient', 'Free requests per client (reserved)', 0, 1000],
  ['penaltyWindowDays', 'Fair use: strikes count for this many days', 7, 180],
  ['clientFreezeAt', 'Fair use: client strikes that freeze posting', 1, 20], ['clientReviewAt', 'Fair use: client strikes that flag the account for admin review', 1, 50],
  ['workerFreezeAt', 'Fair use: worker strikes that freeze accepting', 1, 20], ['workerReviewAt', 'Fair use: worker strikes that flag the account for admin review', 1, 50],
  ['freezeDays', 'Fair use: days an account stays frozen', 1, 90],
  ['noResponseHours', 'Fair use: release a worker who has no agreed price after (hours)', 1, 720],
  ['autoConfirmDays', 'Fair use: confirm a "done" job automatically after (days of client silence)', 1, 60],
  ['disputeAfterReopens', 'Fair use: "Not done yet" this many times turns the job into a dispute', 1, 10],
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
      setMsg(r.disabled ? 'Automatic rules are switched off (save the setting first).' : `Done. Auto-confirmed: ${r.autoConfirmed}, released: ${r.released}, new strikes: ${r.strikes}, frozen: ${r.frozen}, flagged for review: ${r.flagged}${r.stoppedEarly ? ' (stopped early, the rest runs next time)' : ''}.`)
    } catch (e) { setErr(e instanceof Error ? e.message : friendlyError(e)) }
  }

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
      {msg && <p role="status" className="text-sm text-ac">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={save}>Save settings</button>
        <button className={btnGhost} onClick={runNow}>Run the fair-use rules now</button>
      </div>
    </div>
  )
}
