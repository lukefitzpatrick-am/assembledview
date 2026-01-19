import crypto from "node:crypto"

type CacheState = "HIT" | "MISS" | "STALE"

type CacheEntry<T> = {
  value: T
  createdAt: number
}

type CacheKeyInput = {
  scope: string
  mba?: string | null
  startDate?: string | null
  endDate?: string | null
  lineItemIds?: string[]
}

const DEFAULT_TTL_SECONDS = Number(process.env.PACE_CACHE_SECONDS ?? 60) || 60
const DEBUG =
  process.env.PACING_DEBUG === "true" ||
  process.env.DEBUG_PACING === "true" ||
  process.env.NEXT_PUBLIC_DEBUG_PACING === "true"

// Keep cache alive across hot reloads in dev.
const globalCache = (() => {
  const g = globalThis as unknown as { __pacingCache?: Map<string, CacheEntry<unknown>> }
  if (!g.__pacingCache) {
    g.__pacingCache = new Map()
  }
  return g.__pacingCache
})()

function normalizeIds(ids?: string[]): string[] {
  if (!Array.isArray(ids)) return []
  const unique = new Set<string>()
  ids.forEach((id) => {
    const normalized = String(id ?? "").trim().toLowerCase()
    if (normalized) unique.add(normalized)
  })
  return Array.from(unique).sort()
}

export function buildPacingCacheKey(input: CacheKeyInput): string {
  const { scope, mba, startDate, endDate } = input
  const ids = normalizeIds(input.lineItemIds ?? [])
  const idsHash = ids.length
    ? crypto.createHash("sha256").update(JSON.stringify(ids)).digest("hex")
    : "no_ids"

  return [scope, mba ?? "no_mba", startDate ?? "no_start", endDate ?? "no_end", idsHash].join("|")
}

export async function getPacingCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<{ value: T; state: CacheState; staleError?: unknown }> {
  const ttlMs = ttlSeconds * 1000
  const now = Date.now()
  const entry = globalCache.get(key) as CacheEntry<T> | undefined
  const isFresh = entry && now - entry.createdAt < ttlMs

  if (isFresh) {
    if (DEBUG) console.info("[pacing-cache] HIT", { key })
    return { value: entry.value, state: "HIT" }
  }

  try {
    const value = await fetcher()
    globalCache.set(key, { value, createdAt: now })
    if (DEBUG) console.info("[pacing-cache] MISS -> stored", { key })
    return { value, state: "MISS" }
  } catch (err) {
    if (entry) {
      if (DEBUG) console.warn("[pacing-cache] STALE fallback", { key, error: String(err) })
      return { value: entry.value, state: "STALE", staleError: err }
    }
    throw err
  }
}
