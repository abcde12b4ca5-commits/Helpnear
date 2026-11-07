import type { ReactNode } from 'react'

export const btn =
  'inline-flex items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50'
export const btnGhost =
  'inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50'
export const input =
  'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600'
export const card = 'rounded-lg border border-gray-200 bg-white p-4 shadow-sm'

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-gray-800">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-600">{hint}</p>}
    </div>
  )
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null
  return <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p>
}

export function Spinner({ label = 'Loading...' }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-gray-600" role="status">{label}</p>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">{children}</p>
}
