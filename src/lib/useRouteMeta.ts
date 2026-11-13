import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { brand } from '../config/brand'

const PUBLIC: Record<string, { title: string; description: string }> = {
  '/': { title: `${brand.name} | Hire local. Get it done.`, description: 'Post your home job in a minute. Workers who cover your ZIP code send you a price. Free to use, across the United States.' },
  '/how-it-works': { title: `How ${brand.name} works | Post a job, get prices, pay directly`, description: `See how ${brand.name} works: post a request, local workers send prices, you pay the worker directly. Free to use.` },
}
const PUBLIC_PREFIX = ['/legal/', '/worker/']

function setTag(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(selector)
  if (!el) { el = create(); document.head.appendChild(el) }
  el.setAttribute(attr, value)
}

/** Keeps <title>, description, canonical and robots in sync with the SPA route. Private/app pages are noindex. */
export function useRouteMeta() {
  const { pathname } = useLocation()
  useEffect(() => {
    const meta = PUBLIC[pathname]
    const isPublic = Boolean(meta) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p))
    if (meta) {
      document.title = meta.title
      setTag('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' }), 'content', meta.description)
    }
    const origin = window.location.origin
    setTag('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), 'href', `${origin}${pathname}`)
    setTag('meta[name="robots"]', () => Object.assign(document.createElement('meta'), { name: 'robots' }), 'content', isPublic ? 'index,follow' : 'noindex,nofollow')
  }, [pathname])
}
