import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { brand } from '../config/brand'

const PUBLIC: Record<string, { title: string; description: string }> = {
  '/': { title: `${brand.name} | Find work. Find help. Next door.`, description: 'Clients post a job in a minute and workers who cover that city send a price. Workers find jobs near them. Free to use, across the United States.' },
  '/how-it-works': { title: `How ${brand.name} works | Post a job, get prices, pay directly`, description: `See how ${brand.name} works: post a request, local workers send prices, you pay the worker directly. Free to use.` },
}
// Legal pages are public. Worker profiles are NOT: public/_headers sends X-Robots-Tag: noindex for /worker/* (privacy), so the meta tag must agree.
const LEGAL: Record<string, { title: string; description: string }> = {
  '/legal/terms': { title: `Terms of Service | ${brand.name}`, description: `The terms for using ${brand.name}: how requests, workers, reviews and fair-use rules work.` },
  '/legal/privacy': { title: `Privacy Policy | ${brand.name}`, description: `How ${brand.name} collects, uses and protects your personal information.` },
  '/legal/guidelines': { title: `Community Guidelines | ${brand.name}`, description: `The rules for respectful, safe and fair behavior for clients and workers on ${brand.name}.` },
  '/legal/disclaimer': { title: `Disclaimer | ${brand.name}`, description: `${brand.name} is a platform that connects people. Read what that means for licenses, insurance and payments.` },
}
const PUBLIC_PREFIX = ['/legal/']

function setTag(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(selector)
  if (!el) { el = create(); document.head.appendChild(el) }
  el.setAttribute(attr, value)
}

/** Keeps <title>, description, canonical and robots in sync with the SPA route. Private/app pages are noindex. */
export function useRouteMeta() {
  const { pathname } = useLocation()
  useEffect(() => {
    const meta = PUBLIC[pathname] ?? LEGAL[pathname.replace(/\/$/, '')]
    const isPublic = Boolean(meta) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p))
    if (meta) {
      document.title = meta.title
      setTag('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' }), 'content', meta.description)
    }
    const origin = window.location.origin
    setTag('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), 'href', `${origin}${pathname}`)
    // The admin is written in Arabic already. Without this Chrome offers to "translate" it and its translate widget is blocked by our CSP (console error).
    const noTranslate = document.head.querySelector('meta[name="google"][content="notranslate"]')
    if (pathname.startsWith('/admin')) { if (!noTranslate) document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'google', content: 'notranslate' })) } else noTranslate?.remove()
    setTag('meta[name="robots"]', () => Object.assign(document.createElement('meta'), { name: 'robots' }), 'content', isPublic ? 'index,follow' : 'noindex,nofollow')
  }, [pathname])
}
