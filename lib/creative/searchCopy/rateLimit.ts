import "server-only"

/** 20 search-copy / copy-chat turns / min per session key. */
const WINDOW_MS = 60_000
const MAX_HITS = 20

type Bucket = { timestamps: number[] }

const buckets = new Map<string, Bucket>()

export function checkSearchCopyRateLimit(sessionKey: string): {
  ok: boolean
  remaining: number
} {
  const now = Date.now()
  let bucket = buckets.get(sessionKey)
  if (!bucket) {
    bucket = { timestamps: [] }
    buckets.set(sessionKey, bucket)
  }

  bucket.timestamps = bucket.timestamps.filter((t) => now - t < WINDOW_MS)

  if (bucket.timestamps.length >= MAX_HITS) {
    return { ok: false, remaining: 0 }
  }

  bucket.timestamps.push(now)
  return { ok: true, remaining: MAX_HITS - bucket.timestamps.length }
}
