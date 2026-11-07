// Tiny in-memory TTL cache. Protects the Firestore read budget for rarely-changing data.
const store = new Map<string, { at: number; value: unknown }>()

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T
  const value = await load()
  store.set(key, { at: Date.now(), value })
  return value
}

export function clearCache(key?: string) {
  if (key) store.delete(key)
  else store.clear()
}
