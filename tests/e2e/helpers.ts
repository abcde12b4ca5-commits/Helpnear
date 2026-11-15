import { expect, type Page } from '@playwright/test'

export const EMULATORS = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
export const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099'
export const PROJECT = 'demo-helpnear'
export const PASSWORD = 'Test-pass-12345'

let n = 0
/** A unique, throw-away address per run so tests never collide (the emulator forgets everything when it stops). */
export const uniqueEmail = (tag: string) => `${tag}-${Date.now().toString(36)}-${++n}@example.test`

/** Clicks the verification link the Auth emulator "sent" (it keeps them in a list instead of e-mailing). */
export async function verifyEmail(email: string) {
  const res = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/oobCodes`)
  const { oobCodes } = (await res.json()) as { oobCodes: { email: string; requestType: string; oobLink: string }[] }
  const mine = oobCodes.filter((c) => c.email === email && c.requestType === 'VERIFY_EMAIL').pop()
  if (!mine) throw new Error(`No verification e-mail was sent to ${email}`)
  const out = await fetch(mine.oobLink)
  expect(out.ok).toBe(true)
}

export async function signUp(page: Page, opts: { role: 'client' | 'worker'; name: string; email: string; password?: string }) {
  await page.goto(`/signup?role=${opts.role}`)
  await page.getByLabel('Name').fill(opts.name)
  await page.getByLabel('Email').fill(opts.email)
  await page.getByLabel('Password').fill(opts.password ?? PASSWORD)
  await page.getByLabel('I am 18 years old or older.').check()
  await page.getByLabel(/I accept the/).check()
  await page.getByRole('button', { name: 'Create account' }).click()
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
}

/** After verifying in the emulator, the site needs a token refresh. The yellow banner has a button for that. */
export async function markVerified(page: Page) {
  const btn = page.getByRole('button', { name: 'I have verified' })
  if (await btn.isVisible().catch(() => false)) await btn.click()
  await expect(page.getByText(/Please verify your email to post or accept/)).toBeHidden()
}

/** Console errors that are expected when no backend is running (blocked network, emulator not up, web fonts). */
export const NOISE = /firestore|firebase|identitytoolkit|securetoken|googleapis|gstatic|ERR_|Failed to load resource|net::|WebChannel|transport errored|offline/i
