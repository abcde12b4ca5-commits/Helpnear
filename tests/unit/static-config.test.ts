import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildCsp } from '../../scripts/csp.mjs'

// The _headers file is the ONLY place security headers are set for the live site (Cloudflare Pages reads it). A typo here silently removes protection,
// so these tests read the real file.
const headers = readFileSync('public/_headers', 'utf8')
const blocks = new Map<string, string[]>()
let cur = ''
for (const line of headers.split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue
  if (!line.startsWith(' ')) { cur = line.trim(); blocks.set(cur, []) } else blocks.get(cur)!.push(line.trim())
}
const all = blocks.get('/*') ?? []
const val = (list: string[], h: string) => list.find((l) => l.toLowerCase().startsWith(h.toLowerCase() + ':'))?.slice(h.length + 1).trim() ?? ''

describe('security headers (public/_headers)', () => {
  it('applies the baseline headers to every page', () => {
    expect(val(all, 'X-Content-Type-Options')).toBe('nosniff')
    expect(val(all, 'X-Frame-Options')).toBe('DENY')
    expect(val(all, 'Referrer-Policy')).toMatch(/strict-origin|no-referrer|same-origin/)
    expect(Number(/max-age=(\d+)/.exec(val(all, 'Strict-Transport-Security'))?.[1])).toBeGreaterThanOrEqual(31536000)
  })
  it('keeps the popup sign-in (Google) working: COOP must allow popups', () => {
    expect(val(all, 'Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups')
  })
  it('caches the hashed build files for a year and does not cache anything else forever', () => {
    expect(val(blocks.get('/assets/*') ?? [], 'Cache-Control')).toMatch(/max-age=31536000.*immutable/)
    for (const [path, list] of blocks) if (path !== '/assets/*') expect(val(list, 'Cache-Control'), path).not.toMatch(/immutable/)
  })
  it('follows Cloudflare\'s file rules: lines under 2,000 characters, at most 100 rules, comments only on their own unindented line', () => {
    const rules = headers.split('\n')
    expect(Math.max(...rules.map((l) => l.length))).toBeLessThan(2000)
    expect(blocks.size).toBeLessThanOrEqual(100)
    for (const l of rules) if (l.startsWith(' ')) expect(l.trim().startsWith('#'), `indented comment would be read as a header: ${l.slice(0, 60)}`).toBe(false)
    for (const l of rules) if (l.startsWith(' ') && l.trim()) expect(l.trim(), l.slice(0, 60)).toMatch(/^(!\s?[A-Za-z][\w-]*|[A-Za-z][\w-]*:\s?.+)$/) // a header, or "! Header" which removes one
  })
  it('sends a Permissions-Policy that switches off camera, microphone and location (the site uses none of them)', () => {
    const pp = val(all, 'Permissions-Policy')
    for (const f of ['camera', 'microphone', 'geolocation']) expect(pp).toContain(`${f}=()`)
  })
  it('sends the Content-Security-Policy as a placeholder that the build fills in (scripts/headers.mjs), with no report-only copy left', () => {
    expect(val(all, 'Content-Security-Policy')).toBe('__CSP__')
    expect(val(all, 'Content-Security-Policy-Report-Only')).toBe('')
  })
  it('removes the Access-Control-Allow-Origin header Cloudflare adds by default (the site is not a public cross-origin API)', () => {
    expect(all).toContain('! Access-Control-Allow-Origin')
  })
  it('never lets a browser or shared cache store private pages', () => {
    for (const p of ['/admin*', '/chat/*', '/login', '/signup', '/post', '/my-requests', '/feed', '/dashboard', '/onboarding', '/notifications']) expect(val(blocks.get(p) ?? [], 'Cache-Control'), p).toBe('no-store')
  })
  it('keeps fonts local (no Google Fonts), so first paint never waits for another server', () => {
    for (const f of ['index.html', 'scripts/prerender.mjs']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
  })
  it('has no inline style attribute in the static HTML (the CSP blocks them); React sets styles through the CSSOM, which is allowed', () => {
    for (const f of ['index.html', 'scripts/prerender.mjs']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\sstyle\s*=\s*["']/)
  })
  it('caches the ZIP lookup files for a day and never lists worker profiles in search', () => {
    expect(val(blocks.get('/zip/*') ?? [], 'Cache-Control')).toMatch(/max-age=86400/)
    expect(val(blocks.get('/worker/*') ?? [], 'X-Robots-Tag')).toContain('noindex')
  })
  it('has no duplicated paths (the second block would be ignored or merged unexpectedly)', () => {
    const paths = headers.split('\n').filter((l) => l && !l.startsWith(' ')).map((l) => l.trim())
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('private pages stay out of search results', () => {
  const app = readFileSync('src/App.tsx', 'utf8')
  const guarded = [...app.matchAll(/path="(\/[^":]*)(?:\/:[^"]*)?"[^\n]*element=\{<(?:Require\w+|Chat|Admin)\b/g)].map((m) => m[1])
  it('finds the guarded routes in App.tsx', () => { expect(guarded).toEqual(expect.arrayContaining(['/post', '/my-requests', '/feed', '/dashboard', '/onboarding', '/notifications', '/admin'])) })
  it.each(guarded)('%s has an X-Robots-Tag noindex rule', (route) => {
    const covering = [...blocks].filter(([p]) => p === route || p === `${route}*` || p === `${route}/*`)
    expect(covering.length, `add a "${route}" block with X-Robots-Tag: noindex to public/_headers`).toBeGreaterThan(0)
    expect(covering.some(([, list]) => /noindex/.test(val(list, 'X-Robots-Tag')))).toBe(true)
  })
  it('sign-in and sign-up pages are noindex too', () => {
    for (const p of ['/login', '/signup']) expect(val(blocks.get(p) ?? [], 'X-Robots-Tag')).toContain('noindex')
  })
})

describe('_redirects', () => {
  it('serves the app for unknown paths (single-page app) without redirecting', () => {
    expect(readFileSync('public/_redirects', 'utf8').trim()).toBe('/* /index.html 200')
  })
})

describe('Firestore rules file that gets deployed', () => {
  it('firebase.json points at firebase/firestore.rules (not the stale copy in the project root)', () => {
    expect(JSON.parse(readFileSync('firebase.json', 'utf8')).firestore.rules).toBe('firebase/firestore.rules')
  })
  it('has no wide-open rule: "if true" is only used for READING the three public collections', () => {
    const rules = readFileSync('firebase/firestore.rules', 'utf8').split('\n')
    let match = ''
    const found: string[] = []
    for (const line of rules) {
      const m = /^\s*match\s+(\S+)/.exec(line); if (m) match = m[1]
      const a = /allow\s+([\w,\s]+?)\s*:\s*if\s+true\b/.exec(line)
      if (a) found.push(`${match} -> ${a[1].replace(/\s+/g, '')}`)
    }
    const allowed = ['/config/{docId} -> get,list', '/categories/{docId} -> get,list', '/legal/{docId} -> get,list']
    expect(found).toEqual(allowed) // anything new here must be a conscious decision
    expect(rules.join('\n')).not.toMatch(/match\s+\/\{document=\*\*\}\s*\{\s*allow[^}]*if\s+(true|request\.time\s*<)/)
  })
  it('a copy of the rules in the project root, if it exists, is identical to the deployed one (an old copy there could be deployed by mistake)', () => {
    if (existsSync('firestore.rules')) expect(readFileSync('firestore.rules', 'utf8')).toBe(readFileSync('firebase/firestore.rules', 'utf8'))
  })
})

describe('quota guards in the source (they protect the free Firebase and Cloudflare limits)', () => {
  const fb = readFileSync('src/lib/firebase.ts', 'utf8')
  it('App Check starts lazily: initializeAppCheck is only called inside ensureAppCheck, never when the file loads', () => {
    const before = fb.slice(0, fb.indexOf('export function ensureAppCheck'))
    expect(before).not.toMatch(/initializeAppCheck\(/)
    expect(fb.match(/initializeAppCheck\(/g)?.length).toBe(2) // Turnstile provider + reCAPTCHA provider, both inside the function
  })
  it('every place that talks to Firebase for a visitor starts it first', () => {
    expect(readFileSync('src/lib/auth.tsx', 'utf8').match(/ensureAppCheck\(\)/g)?.length).toBeGreaterThanOrEqual(5)
    expect(readFileSync('src/lib/catalog.ts', 'utf8').match(/ensureAppCheck\(\)/g)?.length).toBe(3)
    expect(readFileSync('src/pages/WorkerProfile.tsx', 'utf8')).toContain('ensureAppCheck()')
  })
  it('the layout only reads the maintenance flag for signed-in users and the sign-in / sign-up pages', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8')
    expect(layout).toMatch(/needsConfig = Boolean\(user\) \|\| pathname === '\/login' \|\| pathname === '\/signup'/)
    expect(layout).not.toMatch(/useEffect\(\(\) => \{ getAppConfig\(\)[^\n]*\[\]\)/) // the old unconditional read on every page view
  })
  it('config, categories and legal text are cached in the browser, not just in memory', () => {
    const cat = readFileSync('src/lib/catalog.ts', 'utf8')
    expect(cat.match(/cachedPersistent\(/g)?.length).toBe(3)
    expect(cat).not.toMatch(/\bcached\(/)
  })
  it('the build publishes no source maps', () => {
    expect(readFileSync('vite.config.ts', 'utf8')).toMatch(/sourcemap:\s*false/)
  })
})

describe('Content-Security-Policy builder (scripts/csp.mjs)', () => {
  const csp = buildCsp({ workerUrl: 'https://api.example.com/', authDomain: 'proj.firebaseapp.com', scriptHashes: ['AAA'], styleHashes: ['BBB'] })
  it('defines every directive that has no fallback to default-src', () => {
    for (const d of ["default-src 'self'", 'script-src', 'style-src', 'connect-src', 'font-src', 'frame-src', "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"]) expect(csp).toContain(d)
  })
  it('has no wildcard host, no unsafe-inline and no unsafe-eval', () => {
    expect(csp).not.toMatch(/\*/)
    expect(csp).not.toMatch(/unsafe-(inline|eval)/)
  })
  it('allows inline code only by hash, and names the Worker and sign-in hosts exactly', () => {
    expect(csp).toMatch(/script-src [^;]*'sha256-AAA'/)
    expect(csp).toMatch(/style-src 'self' 'sha256-BBB'(;|$)/)
    expect(csp).toContain('https://api.example.com;')
    expect(csp).toMatch(/frame-src [^;]*https:\/\/proj\.firebaseapp\.com/)
  })
  it('falls back to <project>.firebaseapp.com when no auth domain is set, and adds emulators only for the test build', () => {
    expect(buildCsp({ projectId: 'p1' })).toContain('https://p1.firebaseapp.com')
    expect(buildCsp({})).not.toContain('localhost')
    expect(buildCsp({ useEmulators: true })).toContain('http://localhost:9099')
  })
})

describe('public service pages have their own guidance (thin, copy-pasted pages do not rank)', () => {
  it('every enabled low-risk service has three distinct sections of at least two points each', async () => {
    const { categories } = await import('../../firebase/seed/data.mjs')
    const { DETAIL } = await import('../../scripts/service-guides.mjs')
    const enabled = (categories as { id: string; enabled: boolean; riskLevel: string }[]).filter((c) => c.enabled && c.riskLevel === 'low')
    for (const c of enabled) {
      const d = (DETAIL as Record<string, string[][]>)[c.id]
      expect(d, `add guidance for ${c.id} in scripts/service-guides.mjs`).toBeDefined()
      expect(d).toHaveLength(3)
      for (const items of d) expect(items.length).toBeGreaterThanOrEqual(2)
    }
    const all = Object.values(DETAIL as Record<string, string[][]>).flat(2)
    expect(new Set(all).size).toBe(all.length) // no sentence reused between services
  })
})
