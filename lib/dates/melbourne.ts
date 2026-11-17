/**
 * The business clock (B34, B43, B49). Melbourne is the business zone, and
 * this module and `./civil` are the only code that gives an instant calendar
 * meaning. Sydney and Melbourne share one offset at every instant (AEST/AEDT,
 * the same daylight saving dates), pinned by `dateHelpers.b43.test.ts` and
 * `businessClock.b49.test.ts`, so former Sydney helpers call these.
 * `npm run check:date-boundaries` keeps zone literals and hand-rolled
 * calendar keys from growing outside `lib/dates`.
 */
import { addDaysISO, daysBetweenISO } from "./civil"

export const BUSINESS_TZ = "Australia/Melbourne"

/** Built once: building an `Intl.DateTimeFormat` costs far more than using one (B43fix R4). */
const PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
})

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export type MelbourneParts = {
  /** `YYYY-MM-DD` */
  ymd: string
  year: number
  /** 1 to 12 */
  month: number
  day: number
  /** 0 to 23 */
  hour: number
  minute: number
  /** 0 Sunday to 6 Saturday */
  weekday: number
}

/** Melbourne wall clock at an instant. Throws on an invalid date. */
export function melbourneParts(value: Date | string | number = new Date()): MelbourneParts {
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date input provided to timezone helper")
  }
  const map: Record<string, string> = {}
  for (const p of PARTS.formatToParts(date)) map[p.type] = p.value
  return {
    ymd: `${map.year}-${map.month}-${map.day}`,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: WEEKDAYS.indexOf(map.weekday),
  }
}

/**
 * The instant of a Melbourne wall-clock time (month 1 to 12; day 0 and other
 * overflow roll as in `Date.UTC`). The offset is read once, at the naive UTC
 * reading, as the three copies this replaced did.
 * shortcut: in the 10 to 11 hours before a daylight saving change the naive
 * reading is already past it, so the result is an hour out (pinned in
 * `businessClock.b49.test.ts`); read the offset a second time at the result
 * when a caller needs those hours right (a question for Luke in B49).
 */
export function melbourneInstant(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms)
  const p = melbourneParts(new Date(guess))
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(guess / 60_000) * 60_000
  return new Date(guess - offset)
}

/** The Melbourne calendar day (`YYYY-MM-DD`) of an instant. Throws on an invalid date. */
export function toMelbourneDateString(value: Date | string | number): string {
  return melbourneParts(value).ymd
}

/** Today in Melbourne as `YYYY-MM-DD`. */
export function getMelbourneTodayISO(reference: Date = new Date()): string {
  return melbourneParts(reference).ymd
}

/**
 * The current Melbourne calendar month as `YYYY-MM`.
 *
 * The one rule for "current month" (B34 Q20, S9). A UTC or host-local month
 * is wrong for up to 11 hours at each month boundary: 31 Oct 14:00 UTC is
 * already 1 Nov 01:00 AEDT.
 */
export function getMelbourneMonthISO(reference: Date = new Date()): string {
  return getMelbourneTodayISO(reference).slice(0, 7)
}

/** Yesterday in Melbourne as `YYYY-MM-DD` (a calendar day back, not 24 hours). */
export function getMelbourneYesterdayISO(reference: Date = new Date()): string {
  return addDaysISO(getMelbourneTodayISO(reference), -1)
}

/** Calendar days between two civil dates, or null when either is malformed. */
function daysOrNull(fromISO: string, toISO: string): number | null {
  try {
    return daysBetweenISO(fromISO, toISO)
  } catch {
    return null
  }
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
  const span = daysOrNull(startISO, endISO)
  if (span == null) {
    return { daysInCampaign: 0, daysElapsed: 0, daysRemaining: 0 }
  }
  const daysInCampaign = Math.max(1, span + 1)
  const elapsedDiff = daysOrNull(startISO, todayISO)
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
