import { expect, test } from '@playwright/test'

// READ-ONLY checks of the live site: only GET requests, no accounts created, nothing written.
//   LIVE_URL=https://helpnear.pages.dev npm run test:live
// Runs in CI right after a deploy, so a broken release is noticed within minutes.

test('home page answers 200 over HTTPS and renders', async ({ page, baseURL }) => {
  expect(baseURL).toMatch(/^https:\/\//)
  const res = await page.goto('/')
  expect(res?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Hire local')
})

test('HTTP is redirected to HTTPS', async ({ request, baseURL }) => {
  const http = baseURL!.replace('https://', 'http://')
  const res = await request.get(http, { maxRedirects: 0 }).catch(() => null)
  if (res) expect([301, 302, 307, 308]).toContain(res.status())
})

test('security headers are present on the home page and on a deep link', async ({ request }) => {
  for (const path of ['/', '/login', '/legal/terms']) {
    const h = (await request.get(path)).headers()
    expect(h['x-content-type-options'], path).toBe('nosniff')
    expect(h['x-frame-options'], path).toBe('DENY')
    expect(h['strict-transport-security'], path).toMatch(/max-age=\d{7,}/)
    expect(h['referrer-policy'], path).toBeTruthy()
    expect(h['content-security-policy'], path).toContain("frame-ancestors 'none'")
  }
})

test('private pages tell search engines not to index them', async ({ request }) => {
  for (const path of ['/admin', '/feed', '/dashboard', '/my-requests', '/post', '/login', '/signup'])
    expect((await request.get(path)).headers()['x-robots-tag'] ?? '', path).toMatch(/noindex/)
})

test('hashed assets are cached for a year', async ({ request }) => {
  const html = await (await request.get('/')).text()
  const asset = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1]
  expect(asset).toBeTruthy()
  expect((await request.get(asset!)).headers()['cache-control']).toMatch(/max-age=31536000/)
})

test('sitemap and robots are served and every sitemap URL answers 200', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text()
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  expect(urls.length).toBeGreaterThan(10)
  for (const u of urls) expect((await request.get(u)).status(), u).toBe(200)
  expect((await request.get('/robots.txt')).status()).toBe(200)
})

test('the site does not expose sensitive files', async ({ request }) => {
  for (const p of ['/.env', '/.git/config', '/package.json', '/firebase/firestore.rules', '/serviceAccount.json', '/worker/wrangler.toml']) {
    const res = await request.get(p)
    const body = res.ok() ? await res.text() : ''
    // The SPA answers 200 with index.html for unknown paths, which is fine as long as it is not the real file.
    expect(body, p).not.toMatch(/PRIVATE KEY|rules_version|\[vars\]|"scripts"|apiKey.*=/)
  }
})

test('public Firestore rules: strangers cannot read private collections', async ({ request }) => {
  // Uses the public REST endpoint with the web API key found in the page bundle, exactly like an attacker would.
  const html = await (await request.get('/')).text()
  const js = await (await request.get(/src="(\/assets\/index-[^"]+\.js)"/.exec(html)![1])).text()
  const key = /AIza[0-9A-Za-z_-]{35}/.exec(js)?.[0]
  const project = /projectId:\s*"([^"]+)"/.exec(js)?.[1] ?? /"projectId":"([^"]+)"/.exec(js)?.[1]
  test.skip(!key || !project, 'Could not find the Firebase config in the bundle')
  for (const col of ['users', 'requests', 'workers', 'strikes', 'admins', 'notifications', 'rate'])
    expect((await request.get(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${col}?key=${key}&pageSize=1`)).status(), `${col} must not be listable by anyone`).toBe(403)
  expect((await request.get(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/config/app?key=${key}`)).status()).toBeLessThan(500)
})
