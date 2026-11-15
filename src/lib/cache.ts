// Two small TTL caches that protect the Firestore read budget (Spark: 50,000 reads/day) for rarely-changing data.
//  - cached():           in memory, lasts until the tab is closed or reloaded.
//  - cachedPersistent(): also kept in localStorage, so a reload, a new tab or a returning visitor does NOT read Firestore again until the TTL ends.
const store = new Map<string, { at: number; value: unknown }>()
const PREFIX = 'hn:cache:v1:'

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T
  const value = await load()
  store.set(key, { at: Date.now(), value })
  return value
}

function readStored<T>(key: string, ttlMs: number): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return undefined
    const { at, value } = JSON.parse(raw) as { at: number; value: T }
    if (typeof at !== 'number' || Date.now() - at >= ttlMs || at > Date.now() + 60_000) return undefined // expired, or the clock moved backwards
    return value
  } catch { return undefined } // private mode, storage full, corrupt JSON: just load normally
}

/** Like cached(), but survives page reloads. Only use for public, non-sensitive, JSON-safe data (config, categories, legal text). */
export async function cachedPersistent<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const mem = store.get(key)
  if (mem && Date.now() - mem.at < ttlMs) return mem.value as T
  const stored = readStored<T>(key, ttlMs)
  if (stored !== undefined) { store.set(key, { at: Date.now(), value: stored }); return stored }
  const value = await load()
  store.set(key, { at: Date.now(), value })
  try { localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value })) } catch { /* storage unavailable: memory cache still works */ }
  return value
}

export function clearCache(key?: string) {
  if (key) store.delete(key)
  else store.clear()
  try {
    if (key) localStorage.removeItem(PREFIX + key)
    else for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k)
  } catch { /* nothing to clear */ }
}
