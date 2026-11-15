import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Automated accessibility check (WCAG 2.1 A/AA). It cannot find everything (a person with a screen reader still should), but it catches the common failures.
// Fails on "serious" and "critical" problems only.
for (const path of ['/', '/how-it-works', '/login', '/signup', '/services/handyman/']) {
  test(`${path} has no serious accessibility problems`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle').catch(() => undefined)
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(bad.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), `${violations.length} total findings`).toEqual([])
  })
}
