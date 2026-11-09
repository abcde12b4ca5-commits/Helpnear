// Nationwide matching without a zones list: every ZIP maps to a point, the point maps to a geohash cell (4 chars, about
// 0.35 x 0.18 degrees). A worker covers every cell that touches a circle (base ZIP + radius). A request lives in one cell.
// Feed filtering is exact (haversine distance), cells are only the coarse, indexable first filter.
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz'
export const CELL_PRECISION = 4
export const RADIUS_OPTIONS = [10, 25, 50] as const
export const MAX_MATCH_KEYS = 500 // keep in sync with firestore.rules (workers.matchKeys size cap)

export interface ZipInfo { zip: string; lat: number; lng: number; city: string; state: string }
export interface Bounds { minLat: number; maxLat: number; minLng: number; maxLng: number }

export function encodeGeohash(lat: number, lng: number, precision = CELL_PRECISION): string {
  let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180, bit = 0, ch = 0, even = true, out = ''
  while (out.length < precision) {
    if (even) { const mid = (minLng + maxLng) / 2; if (lng >= mid) { ch = (ch << 1) | 1; minLng = mid } else { ch <<= 1; maxLng = mid } }
    else { const mid = (minLat + maxLat) / 2; if (lat >= mid) { ch = (ch << 1) | 1; minLat = mid } else { ch <<= 1; maxLat = mid } }
    even = !even
    if (++bit === 5) { out += B32[ch]; bit = 0; ch = 0 }
  }
  return out
}

export function geohashBounds(hash: string): Bounds {
  let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180, even = true
  for (const c of hash) {
    const v = B32.indexOf(c)
    for (let b = 4; b >= 0; b--) {
      const on = (v >> b) & 1
      if (even) { const mid = (minLng + maxLng) / 2; if (on) minLng = mid; else maxLng = mid }
      else { const mid = (minLat + maxLat) / 2; if (on) minLat = mid; else maxLat = mid }
      even = !even
    }
  }
  return { minLat, maxLat, minLng, maxLng }
}

const rad = (d: number) => (d * Math.PI) / 180
export function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** All cells that touch the circle. Samples the bounding box more densely than the cell size, then keeps cells whose box is within the radius. */
export function cellsCovering(lat: number, lng: number, radiusMiles: number): string[] {
  const dLat = radiusMiles / 69
  const dLng = radiusMiles / (69 * Math.max(0.2, Math.cos(rad(lat))))
  const stepLat = 0.08, stepLng = 0.16 // cells are 0.1758 x 0.3516 degrees, so every cell gets at least one sample
  const found = new Set<string>([encodeGeohash(lat, lng)])
  for (let y = lat - dLat - stepLat; y <= lat + dLat + stepLat; y += stepLat) {
    for (let x = lng - dLng - stepLng; x <= lng + dLng + stepLng; x += stepLng) {
      if (y < -90 || y > 90) continue
      found.add(encodeGeohash(y, ((x + 540) % 360) - 180))
    }
  }
  return [...found].filter((h) => {
    const b = geohashBounds(h)
    const nLat = Math.min(b.maxLat, Math.max(b.minLat, lat)), nLng = Math.min(b.maxLng, Math.max(b.minLng, lng))
    return haversineMiles(lat, lng, nLat, nLng) <= radiusMiles
  }).sort()
}

export const matchKeysFor = (categories: string[], cells: string[]): string[] => categories.flatMap((c) => cells.map((cell) => `${c}|${cell}`))

const zipCache = new Map<string, Record<string, [number, number, string, string]> | null>()
/** Looks a ZIP up in the prebuilt file public/zip/<first 3 digits>.json (see scripts/build-zips.mjs). Returns null when unknown. */
export async function lookupZip(zip: string): Promise<ZipInfo | null> {
  if (!/^[0-9]{5}$/.test(zip)) return null
  const prefix = zip.slice(0, 3)
  if (!zipCache.has(prefix)) {
    try {
      const res = await fetch(`/zip/${prefix}.json`)
      zipCache.set(prefix, res.ok && (res.headers.get('content-type') ?? '').includes('json') ? await res.json() : null)
    } catch { zipCache.set(prefix, null) }
  }
  const v = zipCache.get(prefix)?.[zip]
  return v ? { zip, lat: v[0], lng: v[1], city: v[2], state: v[3] } : null
}
