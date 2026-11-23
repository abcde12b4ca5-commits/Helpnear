import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { nextRunIn } from '../../src/shared/articles'

vi.mock('../../src/lib/auth', () => ({ useAuth: () => ({ user: { uid: 'a', email: 'owner@site.test' }, isAdmin: true, loading: false }) }))
vi.mock('../../src/lib/firebase', () => ({ db: {}, auth: {}, WORKER_URL: '' }))
vi.mock('firebase/firestore', () => ({
  Timestamp: { fromDate: () => ({}) }, collection: () => ({}), query: () => ({}), where: () => ({}), orderBy: () => ({}), limit: () => ({}),
  getCountFromServer: async () => ({ data: () => ({ count: 3 }) }), getDocs: async () => ({ docs: [] }), getDoc: async () => ({ exists: () => false }),
  doc: () => ({}), serverTimestamp: () => ({}), writeBatch: () => ({}), addDoc: async () => ({}), setDoc: async () => ({}), updateDoc: async () => ({}), deleteDoc: async () => ({}),
}))

describe('nextRunIn', () => {
  const H = 3_600_000
  it('3 a day means one article every 8 hours', () => {
    const r = nextRunIn(1, 3, 1_000_000_000, 1_000_000_000 + 2 * H)
    expect(r.intervalMs).toBe(8 * H)
    expect(r.leftMs).toBe(6 * H)
    expect(r.neverRan).toBe(false)
  })
  it('is due now once the interval has passed, and reports a first run', () => {
    expect(nextRunIn(1, 1, 1000, 1000 + 25 * H).leftMs).toBe(0)
    expect(nextRunIn(2, 1, 0).neverRan).toBe(true)
    expect(nextRunIn(1, 0, 5).intervalMs).toBe(24 * H)
  })
})

describe('admin redesign renders (server side)', () => {
  it('shows the dark sidebar with the brand, groups and the owner card', async () => {
    const { default: Admin } = await import('../../src/pages/Admin')
    const html = renderToString(createElement(MemoryRouter, null, createElement(Admin)))
    expect(html).toContain('ad-brand')
    expect(html).toContain('ad-me')
    expect(html).toContain('owner@site.test')
    for (const t of ['نظرة عامة', 'العمليات', 'المحتوى', 'المنصة', 'لوحة المعلومات', 'المقالات']) expect(html, t).toContain(t)
    expect(html).toContain('aria-selected="true"')
  })
  it('renders the dashboard automation card from the settings it is given', async () => {
    const { default: Dashboard } = await import('../../src/pages/admin/Dashboard')
    const auto = { mode: 'publish', everyDays: 1, perDay: 3, perTitle: 1, topics: ['a', 'b'], lastPublishedSlug: 'house-cleaning-cost', lastPublishedTitle: 'House Cleaning Cost', lastPublishedAt: { toDate: () => new Date('2026-11-22T10:07:00Z') }, lastRunAt: { toDate: () => new Date() } } as const
    const html = renderToString(createElement(MemoryRouter, null, createElement(Dashboard, { auto: auto as never })))
    expect(html).toContain('النشر التلقائي للمقالات')
    expect(html).toContain('ينشر مباشرة')
    expect(html).toContain('/blog/house-cleaning-cost')
    expect(html).toContain('role="progressbar"')
  })
  it('says so when the automatic writing is off', async () => {
    const { default: Dashboard } = await import('../../src/pages/admin/Dashboard')
    const html = renderToString(createElement(MemoryRouter, null, createElement(Dashboard, { auto: { mode: 'off', everyDays: 1, perDay: 1, perTitle: 1, topics: [] } })))
    expect(html).toContain('الكتابة التلقائية متوقفة')
  })
})
