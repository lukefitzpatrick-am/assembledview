type CacheEntry<T> = {
  value: T
  expiresAt: number
}

// Keep cache alive across hot reloads in dev.
const globalCache = (() => {
  const g = globalThis as unknown as { __ttlCache?: Map<string, CacheEntry<unknown>> }
  if (!g.__ttlCache) {
    g.__ttlCache = new Map()
  }
  return g.__ttlCache
})()

export function get<T = unknown>(key: string): T | null {
  const entry = globalCache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() >= entry.expiresAt) {
    globalCache.delete(key)
    return null
  }
  return entry.value
}

export function set<T = unknown>(key: string, value: T, ttlSeconds: number): void {
  const ttlMs = Math.max(0, Number(ttlSeconds) || 0) * 1000
  globalCache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

/**
 * Delete all cache entries whose keys start with the given prefix.
 *
 * Returns the count of entries deleted. Safe to call when no matching
 * keys exist — returns 0.
 */
export function deleteByPrefix(prefix: string): number {
  let count = 0
  for (const key of globalCache.keys()) {
    if (key.startsWith(prefix)) {
      globalCache.delete(key)
      count++
    }
  }
  return count
}

