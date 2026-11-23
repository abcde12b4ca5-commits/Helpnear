// Two small TTL caches that protect the Firestore read budget (Spark: 50,000 reads/day) for rarely-changing data.
//  - cached():           in memory, lasts until the tab is closed or reloaded.
//  - cachedPersistent(): also kept in localStorage, so a reload, a new tab or a returning visitor does NOT read Firestore again until the TTL ends.
const store = new Map<string, { at: number; value: unknown }>()
const PREFIX = 'hn:cache:v1:'

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T
  let value: T
  try { value = await load() } catch (e) {
    if (hit) return hit.value as T // reload failed (quota exhausted, offline): the last known value is better than an error
    throw e
  }
  store.set(key, { at: Date.now(), value })
  return value
}

/** Like readStored() but ignores the TTL: used only as a fallback when a fresh load fails. */
function readStoredStale<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return undefined
    const { value } = JSON.parse(raw) as { at: number; value: T }
    return value
  } catch { return undefined }
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
  let value: T
  try { value = await load() } catch (e) {
    // Firestore quota exhausted or offline: show the last copy we have (even if its TTL ended) instead of an empty page
    const old = mem ? (mem.value as T) : readStoredStale<T>(key)
    if (old !== undefined) return old
    throw e
  }
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
