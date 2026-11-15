import type { ReactNode } from 'react'
import { card, Pill } from './ui'
import type { RequestDoc } from '../lib/types'

export const URGENCY: Record<string, string> = { asap: 'As soon as possible', this_week: 'This week', flexible: 'Flexible' }
export const STATUS: Record<string, string> = { open: 'Open', filled: 'All workers found', closed: 'Closed', expired: 'Expired', removed: 'Removed' }
export const urgencyTone = (u: string) => (u === 'asap' ? 'y' : undefined)

export default function RequestCard({ r, distanceMiles, children }: { r: RequestDoc; distanceMiles?: number; children?: ReactNode }) {
  return (
    <li className={`${card} hn-in`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xl">{r.title}</h3>
        <span className="text-sm text-mu">
          {r.categoryName}{r.city ? <> &middot; {r.city}, {r.state} {r.zip}</> : r.zip ? <> &middot; {r.zip}</> : null}{distanceMiles != null ? ` \u00b7 ${Math.max(1, Math.round(distanceMiles))} mi away` : ''}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm">{r.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Pill tone={urgencyTone(r.urgency)}>{URGENCY[r.urgency] ?? r.urgency}</Pill>
        {r.budgetRange && <span className="text-mu">Budget: {r.budgetRange}</span>}
        <Pill tone={r.status === 'open' ? 'g' : undefined}>{STATUS[r.status] ?? r.status}</Pill>
        <span className="text-mu">Workers: {r.claimsCount} of {r.workersNeeded ?? 1}</span>
      </div>
      {children && <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div>}
    </li>
  )
}
