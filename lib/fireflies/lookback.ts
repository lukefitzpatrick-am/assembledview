/**
 * Parameterised Fireflies first-sync lookback (default 60 days).
 */
export const DEFAULT_SYNC_LOOKBACK_DAYS = 60

export function resolveSyncLookbackDays(
  raw?: number | string | null
): number {
  const n = Number(
    raw ?? process.env.FIREFLIES_SYNC_LOOKBACK_DAYS ?? DEFAULT_SYNC_LOOKBACK_DAYS
  )
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SYNC_LOOKBACK_DAYS
  return Math.min(Math.floor(n), 365)
}

export function defaultSyncFromDate(
  now: Date = new Date(),
  lookbackDays: number = resolveSyncLookbackDays()
): string {
  const d = new Date(now.getTime())
  d.setUTCDate(d.getUTCDate() - lookbackDays)
  return d.toISOString()
}
