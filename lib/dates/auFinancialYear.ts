/**
 * Australian financial year helpers for presentation filters (Home / Campaigns).
 *
 * Twin-check (FY-1 / DI-9b):
 * - Reuses start-year identity from `lib/finance/months.ts`
 *   (`australianFyStartYearForDate`, `fyDisplayLabel`) — same convention as finance hub
 *   `?fy=2026` (= Jul 2026 – Jun 2027).
 * - Does NOT use `lib/ava/tools/fyToRange.ts` (ending-year convention for AVA spoken "FY26").
 * - Does NOT use `getAustralianFinancialYear*` Date windows in `lib/api/dashboard/shared.ts`
 *   (local/Melbourne Date objects; overlap here is string compare on YYYY-MM-DD).
 * - Forecast's private `campaignTouchesFinancialYear` uses `new Date(iso)` (UTC drift risk)
 *   and treats missing dates as include — different semantics; not reused.
 */

import {
  australianFyStartYearForDate,
  fyDisplayLabel,
} from "@/lib/finance/months"

/** FY start calendar year, or `"all"`. */
export type AuFyFilterValue = number | "all"

export type AuFyFilterOption = {
  value: AuFyFilterValue
  /** Short control label, e.g. `FY26`. */
  label: string
  /** Full range for title/tooltip, e.g. `2026–27 (1 Jul 2026 – 30 Jun 2027)`. */
  title: string
}

/**
 * Extract a timezone-naive `YYYY-MM-DD` from campaign date fields.
 * Takes the leading calendar date as written — no `Date` / UTC reinterpretation.
 */
export function campaignDateOnly(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const month = Number(m[2])
  const day = Number(m[3])
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

/** Inclusive FY bounds as date-only strings (1 Jul – 30 Jun). */
export function auFyBoundsDateOnly(fyStartYear: number): { start: string; end: string } {
  const y = Math.trunc(fyStartYear)
  return {
    start: `${y}-07-01`,
    end: `${y + 1}-06-30`,
  }
}

export function auFyShortLabel(fyStartYear: number): string {
  return `FY${String(Math.trunc(fyStartYear)).slice(-2)}`
}

/**
 * Overlap (not containment): campaign is IN the FY when
 * start <= FY end AND end >= FY start.
 *
 * Null-date rules:
 * - both missing → All only
 * - one known → include under a specific FY only if that date falls inside the FY
 * - both known → standard overlap
 */
export function campaignOverlapsAuFinancialYear(
  startDate: unknown,
  endDate: unknown,
  fy: AuFyFilterValue,
): boolean {
  if (fy === "all") return true

  const start = campaignDateOnly(startDate)
  const end = campaignDateOnly(endDate)
  const { start: fyStart, end: fyEnd } = auFyBoundsDateOnly(fy)

  if (!start && !end) return false
  if (start && end) return start <= fyEnd && end >= fyStart
  if (start) return start >= fyStart && start <= fyEnd
  return end! >= fyStart && end! <= fyEnd
}

/** Parse `?fy=` — absent/invalid → current AU FY start year. `all` → `"all"`. */
export function parseAuFySearchParam(
  raw: string | null | undefined,
  today: Date = new Date(),
): AuFyFilterValue {
  if (raw == null) return australianFyStartYearForDate(today)
  const trimmed = String(raw).trim().toLowerCase()
  if (!trimmed) return australianFyStartYearForDate(today)
  if (trimmed === "all") return "all"
  const n = Number(trimmed)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 2000 || n > 2100) {
    return australianFyStartYearForDate(today)
  }
  return n
}

/**
 * Serialize for the URL. Omits the param when value is the current FY (default),
 * so absent URL = current; writes `all` or a start year otherwise.
 */
export function serializeAuFySearchParam(
  fy: AuFyFilterValue,
  today: Date = new Date(),
): string | null {
  if (fy === "all") return "all"
  const current = australianFyStartYearForDate(today)
  if (fy === current) return null
  return String(fy)
}

export function auFyFilterOptions(today: Date = new Date()): AuFyFilterOption[] {
  const current = australianFyStartYearForDate(today)
  const mk = (fyStartYear: number, role: "current" | "previous" | "next"): AuFyFilterOption => {
    const range = fyDisplayLabel(fyStartYear)
    const { start, end } = auFyBoundsDateOnly(fyStartYear)
    const roleLabel =
      role === "current" ? "Current" : role === "previous" ? "Previous" : "Next"
    return {
      value: fyStartYear,
      label: auFyShortLabel(fyStartYear),
      title: `${roleLabel} · ${range} (${formatAuDay(start)} – ${formatAuDay(end)})`,
    }
  }
  return [
    mk(current, "current"),
    mk(current - 1, "previous"),
    mk(current + 1, "next"),
    {
      value: "all",
      label: "All",
      title: "All financial years",
    },
  ]
}

function formatAuDay(isoDateOnly: string): string {
  const [y, m, d] = isoDateOnly.split("-")
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const mi = Number(m) - 1
  return `${Number(d)} ${months[mi] ?? m} ${y}`
}

export { australianFyStartYearForDate, fyDisplayLabel }
