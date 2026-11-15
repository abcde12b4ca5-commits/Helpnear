// k6: fixed number of requests per second against the home page + one ZIP file, to find where latency "bends".
import http from 'k6/http'
import { check } from 'k6'

const BASE = (__ENV.BASE_URL || 'http://localhost:4173').replace(/\/$/, '')
const RATE = Number(__ENV.RATE || 20)

export const options = {
  scenarios: { load: { executor: 'constant-arrival-rate', rate: RATE, timeUnit: '1s', duration: __ENV.DURATION || '15s', preAllocatedVUs: Math.min(RATE * 2, 400), maxVUs: Math.min(RATE * 4, 1000) } },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

export default function () {
  const r = http.batch([['GET', `${BASE}/`], ['GET', `${BASE}/zip/770.json`]])
  check(r[0], { ok: (x) => x.status === 200 })
}
