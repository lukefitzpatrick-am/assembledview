/**
 * The one Melbourne date helper family (B34, B43). `lib/pacing/pacingWindow`,
 * `lib/pacing/maths` (`getAsOfDate`, `getMelbourneYesterdayISO`) and
 * `resolveMonthLocks.currentSydneyMonth` delegate here. Sydney and Melbourne
 * share one zone (AEST/AEDT, the same daylight saving dates), pinned by
 * `dateHelpers.b43.test.ts` over a 3-year sweep.
 */
import { toMelbourneDateString } from "@/lib/timezone"

/**
 * One civil date (`YYYY-MM-DD`) moved by `days` calendar days, in UTC
 * arithmetic (no zone, so no daylight saving step).
 */
export function shiftISODate(isoDate: string, days: number): string {
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
 * Returns the current Melbourne calendar month as `YYYY-MM`.
 *
 * The one rule for "current month" and "(to date)" in display and range
 * labels (B34, Q20). A UTC or host-local month is wrong for up to 11 hours
 * at each month boundary: 31 Oct 14:00 UTC is already 1 Nov 01:00 AEDT.
 * Billing months and money calculations keep their own month source.
 */
export function getMelbourneMonthISO(reference: Date = new Date()): string {
  return getMelbourneTodayISO(reference).slice(0, 7)
}

/**
 * Returns yesterday's date in Australia/Melbourne as `YYYY-MM-DD`.
 *
 * This is computed in Melbourne calendar terms (not “now minus 24h”),
 * so it behaves correctly across DST transitions.
 */
export function getMelbourneYesterdayISO(reference: Date = new Date()): string {
  const today = getMelbourneTodayISO(reference)
  return shiftISODate(today, -1)
}

function utcMillisFromISODate(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split("-").map((v) => Number(v))
  const ms = Date.UTC(y, (m ?? 1) - 1, d ?? 1)
  return Number.isFinite(ms) ? ms : null
}

function isoDiffDays(fromISO: string, toISO: string): number | null {
  const from = utcMillisFromISODate(fromISO)
  const to = utcMillisFromISODate(toISO)
  if (from == null || to == null) return null
  return Math.round((to - from) / 86_400_000)
}

export type InclusiveCampaignDayMetrics = {
  daysInCampaign: number
  daysElapsed: number
  daysRemaining: number
}

/**
 * Inclusive campaign day counts on a civil calendar (YYYY-MM-DD).
 * Pass Melbourne today so Vercel UTC and AU local hosts agree.
 * Start day is Day 1; a 1 Sep–30 Nov window is 91 days.
 */
export function inclusiveCampaignDayMetrics(
  startISO: string,
  endISO: string,
  todayISO: string = getMelbourneTodayISO(),
): InclusiveCampaignDayMetrics {
  const span = isoDiffDays(startISO, endISO)
  if (span == null) {
    return { daysInCampaign: 0, daysElapsed: 0, daysRemaining: 0 }
  }
  const daysInCampaign = Math.max(1, span + 1)
  const elapsedDiff = isoDiffDays(startISO, todayISO)
  if (elapsedDiff == null) {
    return { daysInCampaign, daysElapsed: 0, daysRemaining: daysInCampaign }
  }
  const daysElapsed = Math.min(daysInCampaign, Math.max(0, elapsedDiff + 1))
  return {
    daysInCampaign,
    daysElapsed,
    daysRemaining: Math.max(0, daysInCampaign - daysElapsed),
  }
}

