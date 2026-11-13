import type { ReactNode } from 'react'
import { card } from './ui'
import type { RequestDoc } from '../lib/types'

const URGENCY: Record<string, string> = { asap: 'As soon as possible', this_week: 'This week', flexible: 'Flexible' }
const STATUS: Record<string, string> = { open: 'Open', filled: 'All workers found', closed: 'Closed', expired: 'Expired', removed: 'Removed' }

export default function RequestCard({ r, distanceMiles, children }: { r: RequestDoc; distanceMiles?: number; children?: ReactNode }) {
  return (
    <li className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{r.title}</h3>
        <span className="text-xs text-mu">
          {r.categoryName}{r.city ? <> &middot; {r.city}, {r.state} {r.zip}</> : r.zip ? <> &middot; {r.zip}</> : null}{distanceMiles != null ? ` \u00b7 ${Math.max(1, Math.round(distanceMiles))} mi away` : ''}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-line text-sm text-tx">{r.description}</p>
      <p className="mt-2 text-xs text-mu">
        {URGENCY[r.urgency] ?? r.urgency}{r.budgetRange ? ` \u00b7 Budget: ${r.budgetRange}` : ''} &middot; {STATUS[r.status] ?? r.status} &middot; Workers: {r.claimsCount} of {r.workersNeeded ?? 1}
      </p>
      {children && <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>}
    </li>
  )
}
