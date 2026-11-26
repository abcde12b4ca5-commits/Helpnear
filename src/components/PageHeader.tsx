import type { ReactNode } from 'react'

/** Heading block shared by the inner pages: optional small label, title, one line of help, and the page's buttons on the right. */
export default function PageHeader({ eyebrow, title, sub, children }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="hn-ph hn-in">
      <div className="min-w-0">
        {eyebrow && <span className="hn-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="hn-ph-actions">{children}</div>}
    </header>
  )
}
