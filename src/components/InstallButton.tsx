import { useEffect, useState } from 'react'

declare global {
  interface Window { hnInstall?: { canInstall: () => boolean; hasNativePrompt: () => boolean; prompt: () => void } }
}

type Variant = 'pill' | 'icon' | 'menu' | 'footer'

const Icon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
)

/** "Install app" entry. /install.js decides what happens on tap: the browser's one-tap install when it has one, otherwise a short step-by-step guide for that browser.
 *  It is always offered (any phone or computer) and hides itself inside the installed app. */
export default function InstallButton({ variant = 'pill' }: { variant?: Variant }) {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    const check = () => setOk(!!window.hnInstall?.canInstall())
    check()
    window.addEventListener('hn-install-ready', check)
    return () => window.removeEventListener('hn-install-ready', check)
  }, [])
  if (!ok) return null
  const run = () => window.hnInstall?.prompt()
  const label = 'Install the Helpnear app on your device'
  if (variant === 'icon') return <button type="button" className="hn-theme" onClick={run} aria-label={label} title="Install app"><Icon /></button>
  if (variant === 'menu') return <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-base font-semibold text-tx hover:bg-sf" onClick={run}><Icon />Install the app</button>
  if (variant === 'footer') return <> · <button type="button" className="underline underline-offset-4 hover:text-white" onClick={run}>Install the app</button></>
  return <button type="button" className="hn-install" onClick={run} aria-label={label}><Icon />Install app</button>
}
