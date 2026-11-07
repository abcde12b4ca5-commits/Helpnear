// Invisible-by-default Cloudflare Turnstile challenge, executed on demand (used to obtain an App Check token).
interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  execute: (el: HTMLElement) => void
  remove: (id: string) => void
}
declare global { interface Window { turnstile?: TurnstileApi } }

let scriptPromise: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { scriptPromise = null; reject(new Error('Could not load the verification script.')) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

export async function getTurnstileToken(siteKey: string): Promise<string> {
  await loadScript()
  const api = window.turnstile
  if (!api) throw new Error('Verification is unavailable.')
  const host = document.createElement('div')
  document.body.appendChild(host)
  return new Promise<string>((resolve, reject) => {
    const cleanup = (id: string) => { try { api.remove(id) } catch { /* already removed */ } host.remove() }
    const id = api.render(host, {
      sitekey: siteKey, execution: 'execute', appearance: 'interaction-only',
      callback: (token: string) => { cleanup(id); resolve(token) },
      'error-callback': () => { cleanup(id); reject(new Error('Verification failed. Please reload and try again.')) },
      'timeout-callback': () => { cleanup(id); reject(new Error('Verification timed out.')) },
    })
    api.execute(host)
  })
}
