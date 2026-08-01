/**
 * Campaign report period windows (Australia/Melbourne civil dates).
 */

import { getMelbourneTodayISO } from "@/lib/dates/melbourne"

export type CampaignReportPeriodKind =
  | "this_month"
  | "last_month"
  | "campaign_to_date"
  | "custom"

export type DateWindow = {
  startISO: string
  endISO: string
}

export type ResolvedCampaignReportPeriod = {
  kind: CampaignReportPeriodKind
  /** Filename / URL slug */
  slug: string
  /** Slide-facing label (sentence case, Australian English) */
  label: string
  current: DateWindow
  /** Equal-length window immediately before `current`, when computable. */
  previous: DateWindow | null
}

function parseYmd(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map((v) => Number(v))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Invalid ISO date: ${iso}`)
  }
  return { y, m, d }
}

function ymd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function addDaysISO(iso: string, days: number): string {
  const { y, m, d } = parseYmd(iso)
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function daysInclusive(startISO: string, endISO: string): number {
  const a = parseYmd(startISO)
  const b = parseYmd(endISO)
  const start = Date.UTC(a.y, a.m - 1, a.d)
  const end = Date.UTC(b.y, b.m - 1, b.d)
  return Math.floor((end - start) / 86_400_000) + 1
}

function minISO(a: string, b: string): string {
  return a <= b ? a : b
}

function maxISO(a: string, b: string): string {
  return a >= b ? a : b
}

function monthBounds(year: number, month1to12: number): DateWindow {
  const startISO = ymd(year, month1to12, 1)
  const next =
    month1to12 === 12 ? ymd(year + 1, 1, 1) : ymd(year, month1to12 + 1, 1)
  const endISO = addDaysISO(next, -1)
  return { startISO, endISO }
}

function previousEqualLength(current: DateWindow): DateWindow {
  const len = daysInclusive(current.startISO, current.endISO)
  const endISO = addDaysISO(current.startISO, -1)
  const startISO = addDaysISO(endISO, -(len - 1))
  return { startISO, endISO }
}

function monthLabel(year: number, month1to12: number): string {
  const dt = new Date(Date.UTC(year, month1to12 - 1, 1))
  return dt.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" })
}

export type ResolveCampaignReportPeriodInput = {
  kind: CampaignReportPeriodKind
  /** Campaign flight start (YYYY-MM-DD), required for campaign_to_date. */
  campaignStartISO?: string | null
  /** Campaign flight end (YYYY-MM-DD). */
  campaignEndISO?: string | null
  customStartISO?: string | null
  customEndISO?: string | null
  /** Override "today" for tests. */
  todayISO?: string
}

/**
 * Resolve current + previous comparison windows for the campaign report.
 * Dates are Melbourne civil YYYY-MM-DD (same convention as delivery as-of).
 */
export function resolveCampaignReportPeriod(
  input: ResolveCampaignReportPeriodInput,
): ResolvedCampaignReportPeriod {
  const today = input.todayISO ?? getMelbourneTodayISO()
  const { y, m } = parseYmd(today)

  if (input.kind === "this_month") {
    const bounds = monthBounds(y, m)
    const current: DateWindow = {
      startISO: bounds.startISO,
      endISO: minISO(bounds.endISO, today),
    }
    const prevMonth = m === 1 ? monthBounds(y - 1, 12) : monthBounds(y, m - 1)
    return {
      kind: "this_month",
      slug: "this-month",
      label: `This month (${monthLabel(y, m)})`,
      current,
      previous: prevMonth,
    }
  }

  if (input.kind === "last_month") {
    const prev = m === 1 ? monthBounds(y - 1, 12) : monthBounds(y, m - 1)
    const before =
      prev.startISO.slice(5, 7) === "01"
        ? monthBounds(Number(prev.startISO.slice(0, 4)) - 1, 12)
        : monthBounds(
            Number(prev.startISO.slice(0, 4)),
            Number(prev.startISO.slice(5, 7)) - 1,
          )
    const { y: py, m: pm } = parseYmd(prev.startISO)
    return {
      kind: "last_month",
      slug: "last-month",
      label: `Last month (${monthLabel(py, pm)})`,
      current: prev,
      previous: before,
    }
  }

  if (input.kind === "campaign_to_date") {
    const start = input.campaignStartISO?.trim()
    if (!start) {
      throw new Error("campaignStartISO is required for campaign_to_date")
    }
    const flightEnd = input.campaignEndISO?.trim() || today
    const current: DateWindow = {
      startISO: start,
      endISO: minISO(flightEnd, today),
    }
    if (current.endISO < current.startISO) {
      throw new Error("Campaign period end is before campaign start")
    }
    return {
      kind: "campaign_to_date",
      slug: "campaign-to-date",
      label: "Campaign to date",
      current,
      previous: previousEqualLength(current),
    }
  }

  // custom
  const start = input.customStartISO?.trim()
  const end = input.customEndISO?.trim()
  if (!start || !end) {
    throw new Error("customStartISO and customEndISO are required for custom period")
  }
  if (end < start) {
    throw new Error("Custom period end must be on or after start")
  }
  const current: DateWindow = { startISO: start, endISO: end }
  return {
    kind: "custom",
    slug: "custom",
    label: `Custom range (${start} to ${end})`,
    current,
    previous: previousEqualLength(current),
  }
}

/** Clip a window to campaign flight when both bounds exist. */
export function clipWindowToCampaign(
  window: DateWindow,
  campaignStartISO?: string | null,
  campaignEndISO?: string | null,
): DateWindow {
  let { startISO, endISO } = window
  if (campaignStartISO) startISO = maxISO(startISO, campaignStartISO)
  if (campaignEndISO) endISO = minISO(endISO, campaignEndISO)
  if (endISO < startISO) {
    return { startISO, endISO: startISO }
  }
  return { startISO, endISO }
}
