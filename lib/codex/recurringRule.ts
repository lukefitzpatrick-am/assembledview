/**
 * Codex `tasks.recurring_rule` — boring text format (no cron parser).
 *
 * Every date decision uses Australia/Sydney civil time.
 *
 * Formats (exact, case-insensitive tokens):
 *   monthly:<day>   — e.g. monthly:15  (day 1–31; clamp to last civil day)
 *   weekly:<dow>    — e.g. weekly:fri   (mon|tue|wed|thu|fri|sat|sun)
 *   monthly:lbd     — last Mon–Fri of the Sydney month (no public-holiday calendar)
 *
 * Period keys (idempotency + description marker):
 *   monthly:N  → YYYY-MM-dN
 *   weekly:dow → YYYY-Www-dow  (ISO week of the due Sydney date)
 *   monthly:lbd → YYYY-MM-lbd
 *
 * Generated tasks stamp description with `[codex-period:<key>]` as the first line.
 */

import { addSydneyDays, sydneyCivilParts } from "@/lib/codex/quickAddParse"

export const CODEX_PERIOD_PREFIX = "[codex-period:"
export const CODEX_PERIOD_SUFFIX = "]"

const DOW_TOKENS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
export type DowToken = (typeof DOW_TOKENS)[number]

/** Sun=0 … Sat=6 — matches `sydneyCivilParts().weekday`. */
const DOW_TO_NUMBER: Record<DowToken, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

export type ParsedRecurringRule =
  | { kind: "monthly_day"; day: number }
  | { kind: "weekly"; dow: DowToken; weekday: number }
  | { kind: "monthly_lbd" }

export type RecurringDue = {
  /** True when the rule fires on this Sydney civil day. */
  shouldGenerate: boolean
  /** Stable period key for (template_id, client_id, period) idempotency. */
  period: string
  /** YYYY-MM-DD due date stamped on the generated task. */
  dueYmd: string
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function lastCivilDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Weekday (0=Sun) for a Sydney civil YYYY-MM-DD via noon UTC probe + Sydney parts. */
export function weekdayOfSydneyYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number)
  // Noon UTC is always the same civil day in Sydney (AEDT/AEST are UTC+10/+11).
  const probe = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0))
  return sydneyCivilParts(probe).weekday
}

/** Last Mon–Fri of the given Sydney month (1–12). No public holidays. */
export function lastBusinessDaySydneyYmd(year: number, month: number): string {
  let day = lastCivilDayOfMonth(year, month)
  while (day >= 1) {
    const ymd = `${year}-${pad2(month)}-${pad2(day)}`
    const dow = weekdayOfSydneyYmd(ymd)
    if (dow !== 0 && dow !== 6) return ymd
    day -= 1
  }
  // Unreachable for real calendars
  return `${year}-${pad2(month)}-01`
}

/**
 * ISO week + ISO year for a Sydney civil date (Thu-based ISO week).
 * Uses the civil YMD as a UTC date — safe because ISO week is civil-calendar math.
 */
export function isoWeekParts(ymd: string): { isoYear: number; week: number } {
  const [y, m, d] = ymd.split("-").map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!))
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1..Sun=7)
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const isoYear = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  )
  return { isoYear, week }
}

export function parseRecurringRule(raw: string | null | undefined): ParsedRecurringRule | null {
  if (raw == null) return null
  const s = raw.trim().toLowerCase()
  if (!s) return null

  if (s === "monthly:lbd") return { kind: "monthly_lbd" }

  const monthly = /^monthly:(\d{1,2})$/.exec(s)
  if (monthly) {
    const day = Number(monthly[1])
    if (!Number.isInteger(day) || day < 1 || day > 31) return null
    return { kind: "monthly_day", day }
  }

  const weekly = /^weekly:(mon|tue|wed|thu|fri|sat|sun)$/.exec(s)
  if (weekly) {
    const dow = weekly[1] as DowToken
    return { kind: "weekly", dow, weekday: DOW_TO_NUMBER[dow] }
  }

  return null
}

export function formatPeriodMarker(period: string): string {
  return `${CODEX_PERIOD_PREFIX}${period}${CODEX_PERIOD_SUFFIX}`
}

export function descriptionWithPeriod(
  period: string,
  body: string | null | undefined
): string {
  const marker = formatPeriodMarker(period)
  const rest = (body ?? "").trim()
  return rest ? `${marker}\n\n${rest}` : marker
}

export function descriptionHasPeriod(
  description: string | null | undefined,
  period: string
): boolean {
  if (!description) return false
  const marker = formatPeriodMarker(period)
  return (
    description === marker ||
    description.startsWith(`${marker}\n`) ||
    description.startsWith(`${marker}\r\n`)
  )
}

/**
 * Resolve whether `now` (instant) is a generation day for the rule in Sydney,
 * and what period / due date to stamp.
 */
export function resolveRecurringDue(
  rule: ParsedRecurringRule,
  now: Date = new Date()
): RecurringDue {
  const sydney = sydneyCivilParts(now)

  if (rule.kind === "monthly_day") {
    const last = lastCivilDayOfMonth(sydney.year, sydney.month)
    const dueDay = Math.min(rule.day, last)
    const dueYmd = `${sydney.year}-${pad2(sydney.month)}-${pad2(dueDay)}`
    const period = `${sydney.year}-${pad2(sydney.month)}-d${dueDay}`
    return {
      shouldGenerate: sydney.day === dueDay,
      period,
      dueYmd,
    }
  }

  if (rule.kind === "monthly_lbd") {
    const dueYmd = lastBusinessDaySydneyYmd(sydney.year, sydney.month)
    const period = `${sydney.year}-${pad2(sydney.month)}-lbd`
    return {
      shouldGenerate: sydney.ymd === dueYmd,
      period,
      dueYmd,
    }
  }

  // weekly
  const shouldGenerate = sydney.weekday === rule.weekday
  // Due is today when generating; period keys the ISO week of that due day.
  const dueYmd = shouldGenerate
    ? sydney.ymd
    : (() => {
        // Still compute the period's due for the current week (for callers that need it).
        const delta = (rule.weekday - sydney.weekday + 7) % 7
        return addSydneyDays(sydney.ymd, delta)
      })()
  const { isoYear, week } = isoWeekParts(dueYmd)
  const period = `${isoYear}-W${pad2(week)}-${rule.dow}`
  return { shouldGenerate, period, dueYmd }
}

/** Normalise user/API input to canonical lowercase form, or null if invalid. */
export function normaliseRecurringRule(
  raw: string | null | undefined
): string | null {
  if (raw == null || raw === "") return null
  const parsed = parseRecurringRule(raw)
  if (!parsed) return null
  if (parsed.kind === "monthly_lbd") return "monthly:lbd"
  if (parsed.kind === "monthly_day") return `monthly:${parsed.day}`
  return `weekly:${parsed.dow}`
}
