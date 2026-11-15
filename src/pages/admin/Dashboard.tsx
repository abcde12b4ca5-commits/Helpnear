import { useEffect, useState } from 'react'
import { Timestamp, collection, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { DEFAULT_CONFIG, getAppConfig } from '../../lib/catalog'
import { Pill, Switch, btnGhost, card } from '../../components/ui'
import type { AppConfig } from '../../lib/types'

const SYSTEM: [keyof AppConfig, string][] = [['signupOpen', 'Sign-ups open'], ['maintenanceMode', 'Maintenance mode'], ['chatEnabled', 'In-app chat'], ['autoRulesEnabled', 'Automatic fair-use rules']]

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
  const items: [string, number | undefined][] = [['New users today', c?.users], ['New requests today', c?.requests], ['Open reports', c?.reports]]
  const go = (t: string) => onGo?.(t)
  return (
    <div className="grid gap-4 lg:grid-cols-[repeat(3,1fr)_1.1fr]">
      {items.map(([label, v], i) => (
        <div key={label} className={`${card} hn-in`} style={{ ['--i' as string]: i }}><p className="text-sm text-mu">{label}</p><p className="font-display text-5xl font-semibold">{err ? '-' : v ?? '...'}</p></div>
      ))}
      <aside className={`${card} hn-in space-y-4 lg:row-span-3 lg:col-start-4 lg:row-start-1`} style={{ ['--i' as string]: 3 }} aria-label="System status">
        <h2 className="text-lg">System</h2>
        {SYSTEM.map(([k, label]) => <div key={k} className="flex items-center justify-between gap-3 text-sm"><span>{label}</span><Switch on={Boolean(cfg[k])} label={label} /></div>)}
        <button className={btnGhost} onClick={() => go('Settings')}>Change in Settings</button>
      </aside>
      <section className={`${card} hn-in space-y-1 lg:col-span-3`} style={{ ['--i' as string]: 4 }}>
        <h2 className="mb-2 text-xl">Needs your decision</h2>
        {([['Reports', (c?.reports ?? 0) > 0 ? `${c?.reports} open` : 'None open', 'Moderation', (c?.reports ?? 0) > 0 ? 'y' : 'g'], ['Disputes', 'Jobs where a side asked an admin to decide', 'Disputes', undefined], ['Users flagged for review', 'Accounts that reached the strike limit', 'Users', undefined]] as const).map(([name, text, tab, tone]) => (
          <div key={name} className="flex items-center gap-3 border-t border-ln py-3">
            <Pill tone={tone as 'y' | 'g' | undefined}>{name}</Pill><span className="flex-1 text-sm text-mu">{text}</span>
            <button className={btnGhost} onClick={() => go(tab)}>Review</button>
          </div>
        ))}
      </section>
      <p className="rounded-xl bg-warn-bg p-3 text-sm text-warn-tx lg:col-span-3">
        Spark free limits are hard daily caps (reads, writes, deletes); when exceeded the service stops until the next day. This page uses cheap count queries and cannot measure your reads. Check the Usage tab in the Firebase console daily during launch, and consider turning on maintenance mode (Settings) if you are close to a limit.
      </p>
    </div>
  )
}
