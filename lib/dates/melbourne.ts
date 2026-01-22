import { toMelbourneDateString } from "@/lib/timezone"

function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map((v) => Number(v))
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/**
 * Returns today's date in Australia/Melbourne as `YYYY-MM-DD`.
 */
export function getMelbourneTodayISO(reference: Date = new Date()): string {
  return toMelbourneDateString(reference)
}

/**
 * Returns yesterday's date in Australia/Melbourne as `YYYY-MM-DD`.
 *
 * This is computed in Melbourne calendar terms (not “now minus 24h”),
 * so it behaves correctly across DST transitions.
 */
export function getMelbourneYesterdayISO(reference: Date = new Date()): string {
  const today = getMelbourneTodayISO(reference)
  return addDaysISO(today, -1)
}

