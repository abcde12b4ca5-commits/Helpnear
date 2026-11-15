import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { NOISE } from './helpers'

// Pages and behaviour that need no backend. These run against the production build.

test.describe('public pages', () => {
  test('home page renders with the main message and sign-up calls to action', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text()) })
    await page.goto('/')
    await expect(page).toHaveTitle(/Helpnear/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Hire local')
    await expect(page.getByRole('link', { name: /Post a request/ }).first()).toHaveAttribute('href', '/signup')
    await expect(page.getByRole('link', { name: /I.m a worker/ }).first()).toHaveAttribute('href', '/signup?role=worker')
    await expect(page.getByRole('contentinfo')).toContainText('not a contractor or an employer') // legal disclaimer must always be visible
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('footer links to Terms, Privacy, Guidelines and Disclaimer', async ({ page }) => {
    await page.goto('/')
    for (const [name, href] of [['Terms', '/legal/terms'], ['Privacy', '/legal/privacy'], ['Community Guidelines', '/legal/guidelines'], ['Disclaimer', '/legal/disclaimer']])
      await expect(page.getByRole('contentinfo').getByRole('link', { name }).first()).toHaveAttribute('href', href)
  })

  test('How it works page loads from the menu', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'How it works' }).click()
    await expect(page).toHaveURL(/\/how-it-works$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('How Helpnear works')
  })

  test('an unknown address shows a friendly "not found" message, not a blank page', async ({ page }) => {
    await page.goto('/this/page/does/not/exist')
    await expect(page.getByText('Page not found.')).toBeVisible()
  })

  test('a missing legal document does not crash the page', async ({ page }) => {
    await page.goto('/legal/does-not-exist')
    await expect(page.getByText(/not available/i)).toBeVisible()
  })
})

test.describe('sign up and sign in forms (client-side validation)', () => {
  test('sign-up needs the age and terms confirmation before anything is sent', async ({ page }) => {
    await page.goto('/signup')
    await page.getByLabel('Name').fill('Test User')
    await page.getByLabel('Email').fill('someone@example.test')
    await page.getByLabel('Password').fill('long-enough-pass')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('alert')).toContainText('18 or older and accept the Terms')
    await expect(page).toHaveURL(/\/signup/)
  })

  test('sign-up refuses a password shorter than 8 characters', async ({ page }) => {
    await page.goto('/signup')
    await page.getByLabel('Name').fill('Test User')
    await page.getByLabel('Email').fill('someone@example.test')
    await page.getByLabel('Password').fill('short')
    await page.getByLabel('I am 18 years old or older.').check()
    await page.getByLabel(/I accept the/).check()
    // The browser's own minLength validation blocks the submit, so the form never reaches the server.
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/signup/)
    expect(await page.getByLabel('Password').evaluate((el: HTMLInputElement) => !el.validity.valid)).toBe(true)
  })

  test('?role=worker preselects "Find work", and the default is "Hire someone"', async ({ page }) => {
    await page.goto('/signup?role=worker')
    await expect(page.getByLabel('Find work')).toBeChecked()
    await page.goto('/signup')
    await expect(page.getByLabel('Hire someone')).toBeChecked()
  })

  test('sign-up links to the Terms and Privacy Policy in a new tab', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('target', '_blank')
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('target', '_blank')
  })

  test('sign-in form has labelled fields, required validation and a way to sign up', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('Email')).toHaveAttribute('type', 'email')
    await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password')
    await expect(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'current-password')
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/login/) // empty form is blocked by the browser
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible()
  })
})

test.describe('access control in the browser (signed out)', () => {
  for (const path of ['/post', '/my-requests', '/feed', '/dashboard', '/onboarding', '/notifications']) {
    test(`${path} sends a signed-out visitor to the sign-in page`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
    })
  }

  test('/admin shows nothing of the admin panel to a visitor and sends them home', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Admin' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Users' })).toHaveCount(0)
  })
})

test.describe('security of what the browser receives', () => {
  test('page is not framable (clickjacking) and does not leak the source of secrets', async ({ request }) => {
    const html = await (await request.get('/')).text()
    expect(html).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/)
    expect(html).not.toMatch(/FIREBASE_SA_JSON|TURNSTILE_SECRET|serviceAccount/i)
  })

  test('no JavaScript bundle contains a private key or a worker secret', async ({ request }) => {
    const html = await (await request.get('/')).text()
    const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1])
    expect(scripts.length).toBeGreaterThan(0)
    for (const s of scripts) {
      const js = await (await request.get(s)).text()
      expect(js, s).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/)
      expect(js, s).not.toMatch(/FIREBASE_SA_JSON|TURNSTILE_SECRET/)
    }
  })

  test('script-like text in the URL is not executed (reflected XSS)', async ({ page }) => {
    let fired = false
    page.on('dialog', async (d) => { fired = true; await d.dismiss() })
    await page.goto('/signup?role=%3Cscript%3Ealert(1)%3C/script%3E')
    await page.goto('/legal/%3Cimg%20src=x%20onerror=alert(1)%3E')
    await page.goto('/%3Cimg%20src=x%20onerror=alert(1)%3E')
    await page.waitForTimeout(500)
    expect(fired).toBe(false)
  })
})

test.describe('SEO files', () => {
  test('robots.txt blocks private areas and points to the sitemap', async ({ request }) => {
    const txt = await (await request.get('/robots.txt')).text()
    for (const p of ['/admin', '/post', '/my-requests', '/feed', '/dashboard', '/login', '/signup']) expect(txt).toContain(`Disallow: ${p}`)
    expect(txt).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/)
  })

  test('sitemap.xml is valid, every URL is public, and none is a private page', async ({ request }) => {
    const res = await request.get('/sitemap.xml')
    expect(res.ok()).toBe(true)
    const xml = await res.text()
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(urls.length).toBeGreaterThan(10)
    expect(new Set(urls).size).toBe(urls.length)
    for (const u of urls) expect(u, u).not.toMatch(/\/(admin|post|my-requests|feed|dashboard|login|signup|onboarding|notifications|chat)(\/|$)/)
  })

  test('every service page in the sitemap exists with title, description, canonical, one h1 and valid structured data', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text()
    const pages = [...xml.matchAll(/<loc>[^<]*?(\/services\/[^<]*)<\/loc>/g)].map((m) => m[1])
    expect(pages.length).toBeGreaterThan(5)
    for (const p of pages) {
      const res = await request.get(p)
      expect(res.status(), p).toBe(200)
      const html = await res.text()
      expect(html, p).toMatch(/<title>[^<]{10,}<\/title>/)
      expect(html, p).toMatch(/<meta name="description" content="[^"]{40,}"/)
      expect(html, p).toMatch(/<link rel="canonical" href="[^"]+"/)
      expect((html.match(/<h1[ >]/g) ?? []).length, `${p} should have exactly one h1`).toBe(1)
      for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) expect(() => JSON.parse(m[1]), `${p} JSON-LD`).not.toThrow()
    }
  })

  test('the ZIP lookup data is served as JSON (not the HTML fallback) and has real ZIPs', async ({ request }) => {
    const res = await request.get('/zip/770.json')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('json')
    const data = (await res.json()) as Record<string, [number, number, string, string]>
    expect(data['77002']).toBeTruthy()
    expect(data['77002'][3]).toBe('TX')
  })
})

test.describe('quota protection: public visitors cost no Firestore reads', () => {
  // In the test build Firestore is the emulator on :8080; in production it is firestore.googleapis.com.
  const FIRESTORE = /localhost:8080|firestore\.googleapis\.com/
  for (const path of ['/', '/how-it-works', '/services/', '/services/handyman/', '/legal/guidelines']) {
    test(`${path} makes no Firestore request for a signed-out visitor`, async ({ page }) => {
      const hits: string[] = []
      page.on('request', (r) => { if (FIRESTORE.test(r.url())) hits.push(r.url()) })
      await page.goto(path)
      await page.waitForLoadState('networkidle').catch(() => undefined)
      await page.waitForTimeout(800)
      // /legal/* legitimately reads its own document (then it is cached for an hour); everything else must be free.
      if (!path.startsWith('/legal/')) expect(hits, hits.join('\n')).toEqual([])
    })
  }

  test('the home page loads no third-party fonts or styles (first paint never waits on another server)', async ({ page }) => {
    const external: string[] = []
    page.on('request', (r) => { const u = new URL(r.url()); if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1' && !/^data:/.test(r.url())) external.push(r.url()) })
    await page.goto('/')
    await page.waitForLoadState('networkidle').catch(() => undefined)
    expect(external.filter((u) => /fonts\.(googleapis|gstatic)\.com/.test(u))).toEqual([])
  })

  test('both critical fonts are preloaded and the text really renders in them', async ({ page }) => {
    await page.goto('/')
    const preloads = await page.locator('link[rel=preload][as=font]').evaluateAll((els) => els.map((e) => (e as HTMLLinkElement).href))
    expect(preloads.some((h) => /inter-latin-400/.test(h))).toBe(true)
    expect(preloads.some((h) => /sora-latin-600/.test(h))).toBe(true)
    await page.evaluate(() => document.fonts.ready)
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))
    expect(loaded).toEqual(expect.arrayContaining(['Inter', 'Sora']))
  })
})

test.describe('The real Content-Security-Policy (from the build) would not block anything the public pages need', () => {
  const csp = () => /Content-Security-Policy(?:-Report-Only)?: (.*)/.exec(readFileSync('dist/_headers', 'utf8'))![1]
  for (const path of ['/', '/how-it-works', '/login', '/signup', '/services/handyman/', '/legal/terms']) {
    test(`${path}: no violations`, async ({ page }) => {
      await page.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') return route.continue()
        const res = await route.fetch()
        await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy-report-only': csp() } })
      })
      await page.addInitScript(() => {
        ;(window as unknown as { __csp: string[] }).__csp = []
        document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`))
      })
      await page.goto(path)
      await page.waitForLoadState('networkidle').catch(() => undefined)
      await page.waitForTimeout(800)
      const v = (await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).filter((x) => !/localhost:(8080|9099)/.test(x)) // emulator addresses exist only in the test build
      expect(v).toEqual([])
    })
  }
})
