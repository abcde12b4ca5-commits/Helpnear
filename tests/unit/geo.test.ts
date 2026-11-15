import { afterEach, describe, expect, it, vi } from 'vitest'
import zipcodes from 'zipcodes'
import {
  CELL_PRECISION, MAX_MATCH_KEYS, RADIUS_OPTIONS, cellsCovering, encodeGeohash, geohashBounds, haversineMiles, lookupZip, matchKeysFor,
} from '../../src/lib/geo'

// Deterministic pseudo random numbers so a failure can be reproduced.
function rng(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296) }

describe('encodeGeohash', () => {
  it('matches published reference values', () => {
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj') // Wikipedia example
    expect(encodeGeohash(42.605, -5.603, 5)).toBe('ezs42') // Wikipedia example
    expect(encodeGeohash(0, 0, 5)).toBe('s0000')
  })
  it('uses 4 characters by default (rules depend on this)', () => {
    expect(CELL_PRECISION).toBe(4)
    expect(encodeGeohash(29.76, -95.36)).toHaveLength(4)
    expect(encodeGeohash(29.76, -95.36)).toBe('9vk1') // Houston: same CELL the rules tests use
  })
  it('handles the extremes of the globe', () => {
    for (const [lat, lng] of [[90, 180], [-90, -180], [90, -180], [-90, 180], [0, 180], [0, -180]]) {
      expect(encodeGeohash(lat, lng)).toMatch(/^[0-9b-hjkmnp-z]{4}$/)
    }
  })
  it('is stable: nearby points share a cell, far points do not', () => {
    expect(encodeGeohash(29.7601, -95.3601)).toBe(encodeGeohash(29.7602, -95.3602))
    expect(encodeGeohash(29.76, -95.36)).not.toBe(encodeGeohash(40.71, -74.0))
  })
})

describe('geohashBounds', () => {
  it('contains the point that produced the hash (random points)', () => {
    const r = rng(42)
    for (let i = 0; i < 500; i++) {
      const lat = r() * 180 - 90, lng = r() * 360 - 180
      const b = geohashBounds(encodeGeohash(lat, lng))
      expect(lat).toBeGreaterThanOrEqual(b.minLat)
      expect(lat).toBeLessThanOrEqual(b.maxLat)
      expect(lng).toBeGreaterThanOrEqual(b.minLng)
      expect(lng).toBeLessThanOrEqual(b.maxLng)
    }
  })
  it('cells are about 0.35 x 0.18 degrees', () => {
    const b = geohashBounds('9vk1')
    expect(b.maxLng - b.minLng).toBeCloseTo(0.3515625, 5)
    expect(b.maxLat - b.minLat).toBeCloseTo(0.17578125, 5)
  })
})

describe('haversineMiles', () => {
  it('is zero for the same point and symmetric', () => {
    expect(haversineMiles(29.76, -95.36, 29.76, -95.36)).toBe(0)
    expect(haversineMiles(29.76, -95.36, 40.71, -74)).toBeCloseTo(haversineMiles(40.71, -74, 29.76, -95.36), 9)
  })
  it('matches known city distances (within 1%)', () => {
    expect(haversineMiles(40.7128, -74.006, 34.0522, -118.2437)).toBeGreaterThan(2445 * 0.99) // New York to Los Angeles
    expect(haversineMiles(40.7128, -74.006, 34.0522, -118.2437)).toBeLessThan(2445 * 1.01)
    expect(haversineMiles(29.7604, -95.3698, 30.2672, -97.7431)).toBeGreaterThan(146 * 0.98) // Houston to Austin
    expect(haversineMiles(29.7604, -95.3698, 30.2672, -97.7431)).toBeLessThan(146 * 1.02)
  })
  it('one degree of latitude is about 69 miles', () => {
    expect(haversineMiles(10, 0, 11, 0)).toBeGreaterThan(68.5)
    expect(haversineMiles(10, 0, 11, 0)).toBeLessThan(69.5)
  })
  it('never returns NaN, even for antipodes (clamped asin)', () => {
    const d = haversineMiles(0, 0, 0, 180)
    expect(Number.isFinite(d)).toBe(true)
    expect(d).toBeCloseTo(12437, -1)
    expect(Number.isFinite(haversineMiles(90, 0, -90, 0))).toBe(true)
  })
})

describe('cellsCovering', () => {
  const places: Record<string, [number, number]> = {
    Houston: [29.7604, -95.3698], 'New York': [40.7128, -74.006], Anchorage: [61.2181, -149.9003], Fairbanks: [64.8378, -147.7164],
    Miami: [25.7617, -80.1918], Honolulu: [21.3069, -157.8583], Seattle: [47.6062, -122.3321], 'Barrow AK': [71.2906, -156.7886],
    Adak: [51.88, -176.66], Guam: [13.4443, 144.7937],
  }

  it('always contains the cell of the center', () => {
    for (const [lat, lng] of Object.values(places)) for (const r of RADIUS_OPTIONS) expect(cellsCovering(lat, lng, r)).toContain(encodeGeohash(lat, lng))
  })

  it('is sorted and has no duplicates', () => {
    const cells = cellsCovering(29.7604, -95.3698, 50)
    expect(cells).toEqual([...cells].sort())
    expect(new Set(cells).size).toBe(cells.length)
  })

  it('a bigger radius never covers fewer cells, and contains the smaller one', () => {
    for (const [lat, lng] of Object.values(places)) {
      const [a, b, c] = RADIUS_OPTIONS.map((r) => cellsCovering(lat, lng, r))
      expect(b.length).toBeGreaterThanOrEqual(a.length)
      expect(c.length).toBeGreaterThanOrEqual(b.length)
      for (const x of a) expect(b).toContain(x)
      for (const x of b) expect(c).toContain(x)
    }
  })

  it('stays within the documented sizes (about 6 / 15-23 / 46-71 cells at US latitudes)', () => {
    const [lat, lng] = places.Houston
    expect(cellsCovering(lat, lng, 10).length).toBeLessThanOrEqual(10)
    expect(cellsCovering(lat, lng, 25).length).toBeLessThanOrEqual(30)
    expect(cellsCovering(lat, lng, 50).length).toBeLessThanOrEqual(80)
  })

  it('a worker with the maximum 5 services stays under the rules cap of 500 match keys everywhere that matters', () => {
    for (const [name, [lat, lng]] of Object.entries(places)) {
      if (name === 'Barrow AK') continue // known exception, covered by the next test
      const keys = matchKeysFor(['a', 'b', 'c', 'd', 'e'], cellsCovering(lat, lng, 50))
      expect(keys.length, name).toBeLessThanOrEqual(MAX_MATCH_KEYS)
    }
  })

  it('KNOWN LIMIT: far-north Alaska at 50 miles with 5 services is over the cap (Onboarding.tsx shows an error instead of saving)', () => {
    const [lat, lng] = places['Barrow AK']
    expect(matchKeysFor(['a', 'b', 'c', 'd', 'e'], cellsCovering(lat, lng, 50)).length).toBeGreaterThan(MAX_MATCH_KEYS)
    expect(matchKeysFor(['a', 'b', 'c', 'd'], cellsCovering(lat, lng, 50)).length).toBeLessThanOrEqual(MAX_MATCH_KEYS) // 4 services is fine
    expect(matchKeysFor(['a', 'b', 'c', 'd', 'e'], cellsCovering(lat, lng, 25)).length).toBeLessThanOrEqual(MAX_MATCH_KEYS) // so is 25 miles
  })

  it('FULL SCAN: of every ZIP in the US dataset, only a handful (far-north Alaska + APO/FPO) can exceed the cap', () => {
    const rows = Object.values((zipcodes as unknown as { codes: Record<string, { zip: string; latitude: number; longitude: number; state: string }> }).codes)
    const over = rows.filter((z) => z.latitude && z.longitude && cellsCovering(z.latitude, z.longitude, 50).length * 5 > MAX_MATCH_KEYS)
    expect(rows.length).toBeGreaterThan(40000)
    expect(over.length).toBeLessThanOrEqual(10)
    for (const z of over) expect(['AK', 'AP', 'AE', 'AA'], `${z.zip} ${z.state} is over the cap but is not Alaska or military`).toContain(z.state)
  }, 30_000)

  it('COVERAGE PROPERTY: every point inside the circle falls in a covered cell (no worker ever misses a nearby job)', () => {
    const r = rng(7)
    for (const [name, [lat, lng]] of Object.entries(places)) {
      for (const radius of RADIUS_OPTIONS) {
        const cells = new Set(cellsCovering(lat, lng, radius))
        let checked = 0
        for (let i = 0; i < 400; i++) {
          const ang = r() * 2 * Math.PI, dist = Math.sqrt(r()) * radius * 0.999
          const pLat = lat + (dist * Math.cos(ang)) / 69
          const pLng = lng + (dist * Math.sin(ang)) / (69 * Math.cos((lat * Math.PI) / 180))
          if (pLat > 90 || pLat < -90 || haversineMiles(lat, lng, pLat, pLng) > radius) continue
          checked++
          expect(cells.has(encodeGeohash(pLat, ((pLng + 540) % 360) - 180)), `${name} ${radius}mi point ${pLat},${pLng}`).toBe(true)
        }
        expect(checked).toBeGreaterThan(100)
      }
    }
  })

  it('does not crash or return garbage near the poles', () => {
    expect(cellsCovering(89.9, 0, 50).length).toBeGreaterThan(0)
    expect(cellsCovering(-89.9, 10, 50).length).toBeGreaterThan(0)
  })

  it('handles the antimeridian (longitude wraps around)', () => {
    const cells = cellsCovering(51.88, 179.9, 50)
    expect(cells.length).toBeGreaterThan(0)
    expect(cells).toContain(encodeGeohash(51.88, -179.9)) // 0.2 degrees away across the date line
  })
})

describe('matchKeysFor', () => {
  it('builds category|cell for every combination', () => {
    expect(matchKeysFor(['cleaning', 'painting'], ['9vk1', '9vk3'])).toEqual(['cleaning|9vk1', 'cleaning|9vk3', 'painting|9vk1', 'painting|9vk3'])
  })
  it('returns nothing when either list is empty', () => {
    expect(matchKeysFor([], ['9vk1'])).toEqual([])
    expect(matchKeysFor(['cleaning'], [])).toEqual([])
  })
})

describe('lookupZip', () => {
  afterEach(() => vi.unstubAllGlobals())
  const ok = (body: unknown) => ({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body })

  it('rejects anything that is not exactly 5 digits without calling the network', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    for (const z of ['', '1234', '123456', 'abcde', '12 45', '1234a', '../../etc', '９９９９９']) expect(await lookupZip(z)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('fetches the 3-digit prefix file once and reuses it', async () => {
    const f = vi.fn().mockResolvedValue(ok({ '77002': [29.75, -95.36, 'Houston', 'TX'], '77003': [29.74, -95.34, 'Houston', 'TX'] })); vi.stubGlobal('fetch', f)
    expect(await lookupZip('77002')).toEqual({ zip: '77002', lat: 29.75, lng: -95.36, city: 'Houston', state: 'TX' })
    expect((await lookupZip('77003'))?.zip).toBe('77003')
    expect(f).toHaveBeenCalledTimes(1)
    expect(f).toHaveBeenCalledWith('/zip/770.json')
  })

  it('returns null for an unknown ZIP in a known prefix', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ '88001': [32.3, -106.7, 'Las Cruces', 'NM'] })))
    expect(await lookupZip('88009')).toBeNull()
  })

  it('returns null (does not throw) on 404, network error, or an HTML fallback page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, headers: new Headers(), json: async () => ({}) }))
    expect(await lookupZip('10001')).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await lookupZip('20001')).toBeNull()
    // Cloudflare's SPA fallback answers 200 text/html for a missing file; that must not be parsed as JSON.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'text/html' }), json: async () => { throw new Error('not json') } }))
    expect(await lookupZip('30001')).toBeNull()
  })
})
