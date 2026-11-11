import type { ReactNode } from 'react'
import { card } from './ui'
import type { RequestDoc } from '../lib/types'

const URGENCY: Record<string, string> = { asap: 'As soon as possible', this_week: 'This week', flexible: 'Flexible' }

export default function RequestCard({ r, children }: { r: RequestDoc; children?: ReactNode }) {
  return (
    <li className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{r.title}</h3>
        <span className="text-xs text-gray-600">{r.categoryName} &middot; {r.zoneName}{r.zip ? ` (${r.zip})` : ''}</span>
      </div>
      <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{r.description}</p>
      <p className="mt-2 text-xs text-gray-600">
        {URGENCY[r.urgency] ?? r.urgency}{r.budgetRange ? ` \u00b7 Budget: ${r.budgetRange}` : ''} &middot; Status: {r.status} &middot; Workers: {r.claimsCount}
      </p>
      {children && <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>}
    </li>
  )
}
