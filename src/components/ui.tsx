import type { ReactNode } from 'react'

// Class names for the editorial design system. Styles live in src/index.css (@layer components).
export const btn = 'hn-btn'
export const btnGhost = 'hn-btn-ghost'
export const input = 'hn-input'
export const card = 'hn-card'

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold text-tx">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-mu">{hint}</p>}
    </div>
  )
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null
  return <p role="alert" className="rounded-xl border-2 border-danger-tx bg-danger-bg px-3 py-2 text-sm text-danger-tx">{message}</p>
}

export function Spinner({ label = 'Loading...' }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-mu" role="status">{label}</p>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border-2 border-dashed border-bd p-6 text-center text-sm text-mu">{children}</p>
}
