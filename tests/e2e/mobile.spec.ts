import { expect, test } from '@playwright/test'

// Phone-sized screen (Pixel 7).
const PAGES = ['/', '/how-it-works', '/login', '/signup']

for (const path of PAGES) {
  test(`${path} cannot be dragged sideways and no real content sticks out of the phone screen`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle').catch(() => undefined)
    const r = await page.evaluate(() => {
      window.scrollTo(300, 0)
      const vw = document.documentElement.clientWidth
      // Decorative overflow (blurred background circles, marquees) is allowed when an ancestor clips it. Real content never is.
      const clipped = (el: Element) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o !== 'visible') return true } return false }
      const sticking = [...document.querySelectorAll('main :is(h1,h2,h3,p,a,button,input,select,textarea,label,img,form)')]
        .filter((el) => !el.closest('.hn-orb') && !clipped(el))
        .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.right > vw + 1 || b.left < -1) })
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent ?? '').trim().slice(0, 30)}"`)
      return { scrolledTo: window.scrollX, vw, sticking }
    })
    expect(r.scrolledTo, 'the page moved sideways').toBe(0)
    expect(r.sticking, `content wider than the ${r.vw}px screen`).toEqual([])
  })
}

test('the phone menu opens, shows the sign-in and sign-up links, and closes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open menu' }).click()
  const menu = page.locator('#mobile-menu')
  await expect(menu.getByRole('link', { name: 'Sign in' })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Get started' })).toBeVisible()
  await page.getByRole('button', { name: 'Close menu' }).click()
  await expect(menu).toBeHidden()
})

test('tap targets in the sign-up form are big enough (at least 24px, WCAG 2.2)', async ({ page }) => {
  await page.goto('/signup')
  for (const loc of [page.getByRole('button', { name: 'Create account' }), page.getByLabel('Email'), page.getByLabel('Password')]) {
    const box = await loc.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(24)
  }
})
