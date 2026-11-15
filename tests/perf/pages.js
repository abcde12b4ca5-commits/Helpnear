// k6: realistic visitors on the STATIC site (HTML, JS bundle, ZIP lookup files, service pages) under growing load.
// Never point this at Firebase/Google APIs: see run.mjs, which refuses to.
import http from 'k6/http'
import { check, group, sleep } from 'k6'

const BASE = (__ENV.BASE_URL || 'http://localhost:4173').replace(/\/$/, '')
const MAX = Number(__ENV.MAX_VUS || 50)
const STEP = __ENV.STAGE_SECONDS || '20s'

export const options = {
  stages: [0.1, 0.25, 0.5, 0.75, 1].map((f) => ({ duration: STEP, target: Math.max(1, Math.round(MAX * f)) })).concat([{ duration: STEP, target: 0 }]),
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:page}': ['p(95)<1000'],
    'http_req_duration{kind:asset}': ['p(95)<1500'],
    'http_req_duration{kind:zip}': ['p(95)<800'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max'],
}

export function setup() {
  const html = http.get(`${BASE}/`).body
  const js = /src="(\/assets\/index-[^"]+\.js)"/.exec(html)
  const services = (http.get(`${BASE}/sitemap.xml`).body.match(/\/services\/[a-z0-9-]+\//g) || []).filter((v, i, a) => a.indexOf(v) === i)
  return { js: js ? js[1] : null, services }
}

const prefixes = ['100', '900', '770', '606', '331', '982', '752', '021', '303', '857']

export default function (d) {
  group('visit home', () => {
    const r = http.get(`${BASE}/`, { tags: { kind: 'page' } })
    check(r, { 'home 200': (x) => x.status === 200, 'home has h1': (x) => x.body.includes('Hire local') })
    if (d.js) check(http.get(`${BASE}${d.js}`, { tags: { kind: 'asset' } }), { 'bundle 200': (x) => x.status === 200 })
  })
  sleep(Math.random() * 2 + 0.5)
  group('browse a service page', () => {
    const p = d.services[Math.floor(Math.random() * d.services.length)] || '/how-it-works'
    check(http.get(`${BASE}${p}`, { tags: { kind: 'page' } }), { 'service 200': (x) => x.status === 200 })
  })
  sleep(Math.random() * 2 + 0.5)
  group('type a ZIP code (lookup file)', () => {
    const r = http.get(`${BASE}/zip/${prefixes[Math.floor(Math.random() * prefixes.length)]}.json`, { tags: { kind: 'zip' } })
    check(r, { 'zip 200': (x) => x.status === 200, 'zip is json': (x) => String(x.headers['Content-Type']).includes('json') })
  })
  sleep(Math.random() * 2 + 0.5)
}
