// Builds public/zip/<first 3 digits>.json from the `zipcodes` npm package (dev dependency).
// Each file maps a 5-digit ZIP to [latitude, longitude, city, state]. The browser fetches only the one file it needs,
// so the app never downloads the whole US list. Runs automatically before `npm run dev` and `npm run build`.
// Data accuracy is NOT verified here: ZIP codes change, refresh the package now and then (npm update zipcodes).
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const out = new URL('../public/zip/', import.meta.url)
const citiesFile = new URL('../public/cities.json', import.meta.url)
if (!process.env.FORCE_ZIPS && existsSync(out) && readdirSync(out).length > 500 && existsSync(citiesFile)) {
  console.log('zip data already built (set FORCE_ZIPS=1 to rebuild)')
  process.exit(0)
}
const require = createRequire(import.meta.url)
const { codes } = require('zipcodes')
const groups = {}
const cityGroups = new Map()
let n = 0
for (const [zip, v] of Object.entries(codes)) {
  if (!/^[0-9]{5}$/.test(zip) || v.country !== 'US' || !Number.isFinite(v.latitude) || !Number.isFinite(v.longitude)) continue
  const g = (groups[zip.slice(0, 3)] ??= {})
  g[zip] = [Math.round(v.latitude * 1e4) / 1e4, Math.round(v.longitude * 1e4) / 1e4, v.city, v.state]
  n++
  const ck = `${v.state}|${v.city}`
  const cg = cityGroups.get(ck) ?? { city: v.city, state: v.state, pts: [] }
  cg.pts.push([v.latitude, v.longitude, zip]); cityGroups.set(ck, cg)
}
mkdirSync(out, { recursive: true })
for (const [prefix, data] of Object.entries(groups)) writeFileSync(new URL(`${prefix}.json`, out), JSON.stringify(data))
console.log(`built ${n} US ZIP codes in ${Object.keys(groups).length} files`)

// public/cities.json: one row per US city [name, state, lat, lng, representative ZIP], sorted by name. Used by the city picker and the
// "use my location" button, so people never have to type a ZIP code. The ZIP is only kept inside the data (it is the ZIP closest to the
// city's centre); it is never shown. The centre is the average of the city's ZIP points.
const rows = []
for (const { city, state, pts } of cityGroups.values()) {
  if (!/^[A-Za-z]/.test(city) || city.length < 3 || /\b(firms?|crm)\b/i.test(city)) continue // company / unique-ZIP names, not places people live
  const lat = pts.reduce((a, p) => a + p[0], 0) / pts.length, lng = pts.reduce((a, p) => a + p[1], 0) / pts.length
  const best = pts.reduce((b, p) => (((p[0] - lat) ** 2 + (p[1] - lng) ** 2) < ((b[0] - lat) ** 2 + (b[1] - lng) ** 2) ? p : b))
  rows.push([city, state, Math.round(lat * 1e4) / 1e4, Math.round(lng * 1e4) / 1e4, best[2]])
}
rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
writeFileSync(citiesFile, JSON.stringify(rows))
console.log(`built ${rows.length} US cities`)
