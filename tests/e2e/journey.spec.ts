import { expect, test, type Browser, type Page } from '@playwright/test'
import { EMULATORS, markVerified, signIn, signUp, uniqueEmail, verifyEmail } from './helpers'

// The most important path on the site, with real users in a real browser, on the Firebase emulators:
// sign up -> verify e-mail -> post a request -> a worker accepts with a price -> client agrees -> worker marks done -> client confirms -> sign out -> sign in.
// Needs the emulators (npm run test:e2e). Nothing here touches production.
test.skip(!EMULATORS, 'Needs the Firebase emulators: run `npm run test:e2e`')
test.describe.configure({ mode: 'serial' })

const ZIP = '77002' // Houston, TX
const post = async (page: Page, o: { service: string; title: string; details: string; phone?: string }) => {
  await page.goto('/post')
  await page.locator('#zip').fill(ZIP)
  await expect(page.getByText('✓ Houston, TX')).toBeVisible()
  await page.getByRole('group', { name: 'Service' }).getByRole('button', { name: o.service, exact: true }).click()
  await page.locator('#t-1').fill(o.title)
  await page.locator('#d-1').fill(o.details)
  await page.locator('#phone').fill(o.phone ?? '5551234567')
  await page.getByRole('button', { name: 'Post request' }).click()
}
const newUser = async (browser: Browser, role: 'client' | 'worker', tag: string) => {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); const email = uniqueEmail(tag)
  await signUp(page, { role, name: `${tag} user`, email })
  return { ctx, page, email }
}
async function onboardWorker(page: Page) {
  await expect(page).toHaveURL(/\/onboarding$/)
  await page.getByLabel('House cleaning', { exact: true }).check()
  await page.getByLabel('I will only perform the allowed services in this category.').check()
  await page.locator('#bzip').fill(ZIP)
  await expect(page.getByText('Houston, TX')).toBeVisible()
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page).toHaveURL(/\/feed$/)
}

test.describe('the main job: from posting to a confirmed service', () => {
  const title = `Deep clean ${Date.now().toString(36)}`
  let client: Awaited<ReturnType<typeof newUser>>, worker: Awaited<ReturnType<typeof newUser>>

  test('a client signs up and lands on the post form, with a reminder to verify the e-mail', async ({ browser }) => {
    client = await newUser(browser, 'client', 'client')
    await expect(client.page).toHaveURL(/\/post$/)
    await expect(client.page.getByRole('heading', { name: 'Post a request' })).toBeVisible()
    await expect(client.page.getByText(/Please verify your email to post or accept/)).toBeVisible()
  })

  test('a worker signs up and sets up a profile (service, ZIP, radius)', async ({ browser }) => {
    worker = await newUser(browser, 'worker', 'worker')
    await onboardWorker(worker.page)
    await expect(worker.page.getByRole('heading', { name: 'Requests for you' })).toBeVisible()
  })

  test('the client verifies the e-mail and posts a request', async () => {
    await verifyEmail(client.email)
    await post(client.page, { service: 'House cleaning', title, details: 'Two bedroom apartment, kitchen and bathroom' })
    await expect(client.page).toHaveURL(/\/my-requests$/)
    await expect(client.page.getByText(title)).toBeVisible()
  })

  test('the matching worker sees it in the feed and accepts with a price', async () => {
    await verifyEmail(worker.email)
    await worker.page.goto('/feed')
    await markVerified(worker.page)
    await worker.page.getByRole('button', { name: new RegExp(title) }).click()
    await worker.page.getByRole('button', { name: 'Accept', exact: true }).click()
    await worker.page.getByLabel('Your price (USD)').fill('150')
    await worker.page.getByLabel('What the price includes').fill('Two hours of deep cleaning')
    await worker.page.getByRole('button', { name: 'Accept this request' }).click()
    await worker.page.goto('/dashboard')
    await expect(worker.page.getByRole('heading', { name: title })).toBeVisible()
    await expect(worker.page.getByText('Waiting for the client to agree to your price.')).toBeVisible()
  })

  test('the client sees the worker and the price, and agrees', async () => {
    await client.page.goto('/my-requests')
    await expect(client.page.getByText('Accepted by worker. Review the price and agree to start.')).toBeVisible()
    await client.page.getByRole('button', { name: 'Agree to price and work' }).click()
    await expect(client.page.getByText('Price agreed. Work in progress.')).toBeVisible()
  })

  test('the worker can now mark the service done with the final amount', async () => {
    await worker.page.goto('/dashboard')
    await expect(worker.page.getByText('Price agreed. Do the work, then mark it done.')).toBeVisible()
    await worker.page.getByRole('button', { name: 'Mark service as done' }).click()
    await worker.page.getByLabel('Final amount for the work (USD)').fill('150')
    await worker.page.getByRole('button', { name: 'Mark as done' }).click()
    await expect(worker.page.getByText('Marked done. Waiting for the client to confirm.')).toBeVisible()
  })

  test('the client confirms, and the amount counts in the totals', async () => {
    await client.page.goto('/my-requests')
    await client.page.getByRole('button', { name: 'Confirm service was done' }).click()
    await expect(client.page.getByText('Service done and confirmed.')).toBeVisible()
    await client.page.getByRole('button', { name: 'Refresh' }).click()
    await expect(client.page.getByText('$150.00').first()).toBeVisible()
    await worker.page.goto('/dashboard')
    await expect(worker.page.getByText('$150.00').first()).toBeVisible()
  })

  test('both sides received in-app notifications', async () => {
    await client.page.goto('/notifications')
    await expect(client.page.getByText(/accepted your request/)).toBeVisible()
    await worker.page.goto('/notifications')
    await expect(worker.page.getByText(/Price agreed for/)).toBeVisible()
  })

  test('the client signs out, is locked out of private pages, then signs back in', async () => {
    await client.page.getByRole('button', { name: 'Sign out' }).click()
    await expect(client.page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible()
    await client.page.goto('/my-requests')
    await expect(client.page).toHaveURL(/\/login$/)
    await signIn(client.page, client.email)
    await expect(client.page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await client.page.goto('/my-requests')
    await expect(client.page.getByText(title)).toBeVisible()
    await client.ctx.close(); await worker.ctx.close()
  })
})

test.describe('things that must be refused', () => {
  test('wrong password and unknown e-mail give the same message', async ({ page }) => {
    const user = await newUser(page.context().browser()!, 'client', 'known')
    await user.ctx.close()
    await signIn(page, user.email, 'Wrong-pass-0000')
    await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.')
    await signIn(page, uniqueEmail('nobody'))
    await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.')
  })

  test('the same e-mail cannot sign up twice', async ({ browser, page }) => {
    const user = await newUser(browser, 'client', 'dup')
    await expect(user.page).toHaveURL(/\/post$/)
    await signUp(page, { role: 'client', name: 'Dup again', email: user.email })
    await expect(page.getByRole('alert')).toContainText('already exists')
    await user.ctx.close()
  })

  test('a client with an unverified e-mail cannot post', async ({ browser }) => {
    const u = await newUser(browser, 'client', 'unverified')
    await post(u.page, { service: 'House cleaning', title: 'Should not be posted', details: 'This must be refused' })
    await expect(u.page.getByRole('alert')).toContainText('verify your email first')
    await expect(u.page).toHaveURL(/\/post$/)
    await u.ctx.close()
  })

  test('regulated work (electrical) is blocked on the form, before anything is saved', async ({ browser }) => {
    const u = await newUser(browser, 'client', 'regulated')
    await verifyEmail(u.email)
    await post(u.page, { service: 'Handyman (general repairs)', title: 'Rewire my kitchen', details: 'Need someone to fix the breaker and rewire the outlet' })
    await expect(u.page.getByRole('alert')).toContainText("isn't available")
    await expect(u.page).toHaveURL(/\/post$/)
    await u.ctx.close()
  })

  test('a worker cannot open client pages, and a client cannot open worker pages', async ({ browser }) => {
    const w = await newUser(browser, 'worker', 'wrole'); await onboardWorker(w.page)
    await w.page.goto('/post'); await expect(w.page).toHaveURL(/\/$/)
    await w.page.goto('/my-requests'); await expect(w.page).toHaveURL(/\/$/)
    const c = await newUser(browser, 'client', 'crole')
    await c.page.goto('/feed'); await expect(c.page).toHaveURL(/\/$/)
    await c.page.goto('/dashboard'); await expect(c.page).toHaveURL(/\/$/)
    await w.ctx.close(); await c.ctx.close()
  })

  test('a normal signed-in user cannot open the admin panel', async ({ browser }) => {
    const u = await newUser(browser, 'client', 'notadmin')
    await u.page.goto('/admin')
    await expect(u.page).toHaveURL(/\/$/)
    await expect(u.page.getByRole('tab', { name: 'Users' })).toHaveCount(0)
    await u.ctx.close()
  })

  test('HTML or script typed into a request is shown as plain text and never runs (stored XSS)', async ({ browser }) => {
    const evil = '<img src=x onerror="window.__xss=1">'
    const c = await newUser(browser, 'client', 'xss'); await verifyEmail(c.email)
    const w = await newUser(browser, 'worker', 'xssw'); await onboardWorker(w.page); await verifyEmail(w.email)
    await post(c.page, { service: 'House cleaning', title: evil, details: `<script>window.__xss=2</script> ${evil} two rooms please` })
    await expect(c.page).toHaveURL(/\/my-requests$/)
    await expect(c.page.getByText(evil, { exact: false }).first()).toBeVisible() // the characters themselves are visible
    await w.page.goto('/feed'); await markVerified(w.page)
    await expect(w.page.getByText(evil, { exact: false }).first()).toBeVisible()
    for (const p of [c.page, w.page]) expect(await p.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
    await c.ctx.close(); await w.ctx.close()
  })

  test('the password rule is enforced by the server too (weak passwords are refused)', async ({ page }) => {
    await page.goto('/signup')
    // The form blocks < 8 characters in the browser; this checks the Auth service itself by calling it directly.
    const res = await page.request.post(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099'}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, { data: { email: uniqueEmail('weak'), password: '123', returnSecureToken: true } })
    expect(res.ok()).toBe(false)
    expect(JSON.stringify(await res.json())).toMatch(/WEAK_PASSWORD/)
  })
})

