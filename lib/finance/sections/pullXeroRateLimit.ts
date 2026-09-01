/**
 * Per-user 1/min gate for POST /api/finance/sections/pull-xero.
 * Process-local Map — Fluid instances do not share it (under-enforces across
 * isolates; does not queue).
 */

const WINDOW_MS = 60_000
const lastRunByUser = new Map<string, number>()

export type PullXeroRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number }

export function consumePullXeroRateLimit(
  userKey: string,
  now = Date.now()
): PullXeroRateLimitResult {
  const key = userKey.trim()
  if (!key) return { ok: true }
  const prev = lastRunByUser.get(key)
  if (prev != null) {
    const elapsed = now - prev
    if (elapsed < WINDOW_MS) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000)),
      }
    }
  }
  lastRunByUser.set(key, now)
  return { ok: true }
}

export function resetPullXeroRateLimitForTests(): void {
  lastRunByUser.clear()
}
