/**
 * Admin pacing counts to the day before the view day (P1, 22 Oct 2026).
 *
 * The client campaign strip counts to Melbourne yesterday, capped at the
 * campaign end (`pacingAsAtISO` in `lib/pacing/expectedForWindow.ts`). The
 * admin surfaces (portfolio, channel tabs, pacing modal, Ava
 * `get_pacing_snapshot`, digest) count to the same day.
 *
 * - The view day (`asOfDate`) is Melbourne today by default, or the day the
 *   toolbar picks. It still decides which campaigns are live, so the list of
 *   campaigns on each surface does not change.
 * - The count-to day is the day before the view day. Expected, delivered,
 *   status and days elapsed stop there. Spend yesterday is that same day.
 * - A campaign starting on the view day has nothing expected yet and reads
 *   not started (count-to day is before its start).
 * - A campaign that ended on the count-to day is fully expected and is not
 *   yet "completed" (count-to day equals its end).
 * - Expected maths already caps elapsed days at the campaign end, so a
 *   campaign that ended earlier is fully expected too.
 */
import { getAsOfDate, getMelbourneYesterdayISO } from "@/lib/pacing/maths"

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export type AdminPacingDays = {
  /** View day. Liveness and cache keys. */
  asOfDate: string
  /** Last day counted. Expected, delivered and status. */
  countToDate: string
}

export function isIsoDay(value: unknown): value is string {
  return typeof value === "string" && ISO_DAY.test(value)
}

/** The day before the view day. */
export function adminPacingCountToISO(asOfDate: string): string {
  return getMelbourneYesterdayISO(asOfDate)
}

/**
 * View day and count-to day for an admin pacing request.
 * A missing or malformed `asOfDate` param falls back to Melbourne today.
 */
export function resolveAdminPacingDays(
  asOfParam?: string | null,
  now: Date = new Date(),
): AdminPacingDays {
  const raw = asOfParam?.trim() ?? ""
  const asOfDate = isIsoDay(raw) ? raw : getAsOfDate(now)
  return { asOfDate, countToDate: adminPacingCountToISO(asOfDate) }
}

/**
 * The day a pacing composer counts facts and status to.
 * Without `countToDate` it counts to `asOfDate`, as before P1.
 */
export function composerCountToISO(args: {
  asOfDate: string
  countToDate?: string | null
}): string {
  return isIsoDay(args.countToDate) ? args.countToDate : args.asOfDate
}

/** Cache key part for a composer read. Old keys never match the new rule. */
export function countToCacheKeyPart(countToDate?: string | null): string {
  return isIsoDay(countToDate) ? `to:${countToDate}` : "to:asof"
}

/** Header label: "As of 2026-10-22, counted to 2026-10-21". */
export function adminCountToLabel(asOfDate: string, countToDate?: string | null): string {
  return isIsoDay(countToDate) && countToDate !== asOfDate
    ? `As of ${asOfDate}, counted to ${countToDate}`
    : `As of ${asOfDate}`
}
