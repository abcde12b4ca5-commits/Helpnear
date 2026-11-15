import type { ReactNode } from 'react'

// Class names for the midnight design system. Styles live in src/index.css (@layer components).
export const btn = 'hn-btn'
export const btnGhost = 'hn-btn-ghost'
export const input = 'hn-input'
export const card = 'hn-card'

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm text-mu">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-mu">{hint}</p>}
    </div>
  )
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null
  return <p role="alert" className="rounded-xl border border-danger-tx/40 bg-danger-bg px-3 py-2 text-sm text-danger-tx">{message}</p>
}

export function Spinner({ label = 'Loading...' }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-mu" role="status">{label}</p>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-bd p-8 text-center text-sm text-mu">{children}</p>
}

export function Pill({ tone, children }: { tone?: 'y' | 'g' | 'r'; children: ReactNode }) {
  return <span className={`hn-pill${tone ? ` ${tone}` : ''}`}>{children}</span>
}

export function Switch({ on, label }: { on: boolean; label: string }) {
  return <span className={`hn-switch${on ? ' on' : ''}`} role="img" aria-label={`${label}: ${on ? 'on' : 'off'}`} />
}
