// Builds public/zip/<first 3 digits>.json from the `zipcodes` npm package (dev dependency).
// Each file maps a 5-digit ZIP to [latitude, longitude, city, state]. The browser fetches only the one file it needs,
// so the app never downloads the whole US list. Runs automatically before `npm run dev` and `npm run build`.
// Data accuracy is NOT verified here: ZIP codes change, refresh the package now and then (npm update zipcodes).
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const out = new URL('../public/zip/', import.meta.url)
if (!process.env.FORCE_ZIPS && existsSync(out) && readdirSync(out).length > 500) {
  console.log('zip data already built (set FORCE_ZIPS=1 to rebuild)')
  process.exit(0)
}
const require = createRequire(import.meta.url)
const { codes } = require('zipcodes')
const groups = {}
let n = 0
for (const [zip, v] of Object.entries(codes)) {
  if (!/^[0-9]{5}$/.test(zip) || v.country !== 'US' || !Number.isFinite(v.latitude) || !Number.isFinite(v.longitude)) continue
  const g = (groups[zip.slice(0, 3)] ??= {})
  g[zip] = [Math.round(v.latitude * 1e4) / 1e4, Math.round(v.longitude * 1e4) / 1e4, v.city, v.state]
  n++
}
mkdirSync(out, { recursive: true })
for (const [prefix, data] of Object.entries(groups)) writeFileSync(new URL(`${prefix}.json`, out), JSON.stringify(data))
console.log(`built ${n} US ZIP codes in ${Object.keys(groups).length} files`)
