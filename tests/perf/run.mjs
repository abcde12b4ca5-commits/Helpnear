// Performance runner (k6). Usage:
//   npm run test:perf                                   -> against http://localhost:4173 (run `npm run preview` after a build)
//   BASE_URL=https://helpnear.pages.dev I_OWN_THIS_SITE=yes npm run test:perf   -> your live static site (careful, see below)
// It first finds the "knee" (the request rate where the site starts to slow), then runs a realistic visitor scenario.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const BASE = (process.env.BASE_URL || 'http://localhost:4173').replace(/\/$/, '')
const host = new URL(BASE).hostname
const local = ['localhost', '127.0.0.1'].includes(host)

// SAFETY: these are paid/quota-limited backends. Load on them would burn your free daily quota and take the site down.
if (/(googleapis\.com|firebaseio\.com|firebaseapp\.com|workers\.dev|cloudflare\.com)$/i.test(host)) {
  console.error(`Refusing to load-test ${host}. Firebase and Workers have daily free quotas (Firestore Spark: 50,000 reads/day) and a test would use them up.`)
  process.exit(2)
}
if (!local && process.env.I_OWN_THIS_SITE !== 'yes') {
  console.error('Set I_OWN_THIS_SITE=yes to run against a remote site. Only test sites you own.')
  process.exit(2)
}
const K6 = process.env.K6_BIN || 'k6'
const ver = spawnSync(K6, ['version'], { encoding: 'utf8', shell: process.platform === 'win32' })
if (ver.status !== 0) { console.error('k6 not found. Install it from https://grafana.com/docs/k6/latest/set-up/install-k6/ or set K6_BIN.'); process.exit(1) }

// A remote CDN site is capped lower by default, so a test is never mistaken for an attack by Cloudflare's protection.
const RATES = (process.env.RATES || (local ? '10,25,50,100,200,400' : '5,10,20,40')).split(',').map(Number)
const DURATION = process.env.DURATION || '15s'
mkdirSync('test-results', { recursive: true })
const num = (v) => (typeof v === 'number' ? v : NaN)
const rows = []

console.log(`Target ${BASE}\nStep 1: finding the knee (${DURATION} at each rate)`)
for (const rate of RATES) {
  const out = `test-results/k6-knee-${rate}.json`
  spawnSync(K6, ['run', '--quiet', '--summary-export', out, '-e', `BASE_URL=${BASE}`, '-e', `RATE=${rate}`, '-e', `DURATION=${DURATION}`, 'tests/perf/knee.js'], { stdio: 'ignore', shell: process.platform === 'win32' })
  const m = JSON.parse(readFileSync(out, 'utf8')).metrics
  const d = m.http_req_duration
  rows.push({ rate, p50: num(d.med), p95: num(d['p(95)']), p99: num(d['p(99)']), fail: num(m.http_req_failed?.value ?? m.http_req_failed?.rate) || 0, dropped: num(m.dropped_iterations?.count) || 0, reqs: num(m.http_reqs.count) })
  const r = rows.at(-1)
  console.log(`  ${String(rate).padStart(4)} iter/s  p50 ${r.p50.toFixed(0)}ms  p95 ${r.p95.toFixed(0)}ms  p99 ${r.p99.toFixed(0)}ms  failed ${(r.fail * 100).toFixed(2)}%  dropped ${r.dropped}`)
  if (r.fail > 0.2) { console.log('  site is failing; stopping the ramp'); break }
}
const base = rows[0].p95
const knee = rows.find((r) => r.p95 > Math.max(base * 3, 300) || r.fail > 0.01 || r.dropped > 0)

let md = `# Performance report (k6)\n\nTarget: \`${BASE}\`  \nEach step: ${DURATION} at a fixed rate; one iteration = home page + one ZIP file (2 requests).\n\n| Iterations/s | Requests/s | p50 | p95 | p99 | Failed | Dropped |\n|---|---|---|---|---|---|---|\n`
for (const r of rows) md += `| ${r.rate} | ${r.rate * 2} | ${r.p50.toFixed(0)} ms | ${r.p95.toFixed(0)} ms | ${r.p99.toFixed(0)} ms | ${(r.fail * 100).toFixed(2)}% | ${r.dropped} |\n`
md += `\n**Knee:** ${knee ? `starts to slow at about ${knee.rate} iterations/s (${knee.rate * 2} requests/s): p95 ${knee.p95.toFixed(0)} ms, ${(knee.fail * 100).toFixed(2)}% failed, ${knee.dropped} dropped.` : `no slowdown up to ${rows.at(-1).rate} iterations/s.`}\n`
console.log(`\nKnee: ${knee ? `${knee.rate} iterations/s` : `none up to ${rows.at(-1).rate}/s`}`)

if (process.env.SKIP_SCENARIO !== '1') {
  console.log('\nStep 2: realistic visitors with growing load (thresholds enforced)')
  const maxVus = process.env.MAX_VUS || (local ? '100' : '30')
  const sc = spawnSync(K6, ['run', '--summary-export', 'test-results/k6-pages.json', '-e', `BASE_URL=${BASE}`, '-e', `MAX_VUS=${maxVus}`, '-e', `STAGE_SECONDS=${process.env.STAGE_SECONDS || '15s'}`, 'tests/perf/pages.js'], { encoding: 'utf8', shell: process.platform === 'win32' })
  const tail = sc.stdout.split('\n').filter((l) => /✓|✗|http_req_duration|http_req_failed|checks|http_reqs|vus_max|iterations/.test(l)).join('\n')
  console.log(tail)
  md += `\n## Realistic visitors, up to ${maxVus} at once\n\n\`\`\`\n${tail}\n\`\`\`\n\nThresholds ${sc.status === 0 ? 'PASSED' : 'FAILED'} (failures <1%, page p95 <1 s, bundle p95 <1.5 s, ZIP file p95 <0.8 s).\n`
  if (sc.status !== 0) process.exitCode = 99
}
writeFileSync('test-results/perf-report.md', md)
console.log('\nSaved test-results/perf-report.md')
