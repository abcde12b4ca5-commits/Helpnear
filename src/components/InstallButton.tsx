import { useEffect, useState } from 'react'

declare global {
  interface Window { hnInstall?: { canInstall: () => boolean; prompt: () => void } }
}

/** "Install app" button in the header. /install.js tells us when the browser can install the site (or when to show the steps for iPhone), and hides it inside the installed app. */
export default function InstallButton() {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    const check = () => setOk(!!window.hnInstall?.canInstall() && !matchMedia('(display-mode: standalone)').matches)
    check()
    window.addEventListener('hn-install-ready', check)
    return () => window.removeEventListener('hn-install-ready', check)
  }, [])
  if (!ok) return null
  return <button type="button" className="hn-install" onClick={() => window.hnInstall?.prompt()} aria-label="Install the Helpnear app on your phone">Install app</button>
}
