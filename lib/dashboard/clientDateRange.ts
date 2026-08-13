/**
 * Client-hub dashboard date window: URL startDate/endDate, legacy ?fy=, else current AU FY.
 */
import { auFyBoundsDateOnly, campaignDateOnly } from "@/lib/dates/auFinancialYear"
import { australianFyStartYearForDate } from "@/lib/finance/months"
import { parseIsoDateOnlyStrict } from "@/lib/dashboard/campaignDateRange"

export const CLIENT_ALL_TIME_START = "2015-07-01"
export const CLIENT_ALL_TIME_END = "2100-06-30"

export type ClientDashboardRange = {
  rangeStartISO: string
  rangeEndISO: string
}

export function currentAuFyRange(now: Date = new Date()): ClientDashboardRange {
  const year = australianFyStartYearForDate(now)
  const { start, end } = auFyBoundsDateOnly(year)
  return { rangeStartISO: start, rangeEndISO: end }
}

export function fyParamToRange(fy: string | null | undefined, now: Date = new Date()): ClientDashboardRange | null {
  if (fy == null) return null
  const trimmed = String(fy).trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed === "all") {
    return { rangeStartISO: CLIENT_ALL_TIME_START, rangeEndISO: CLIENT_ALL_TIME_END }
  }
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n < 2015 || n > 2100) return null
  const { start, end } = auFyBoundsDateOnly(n)
  return { rangeStartISO: start, rangeEndISO: end }
}

export function resolveClientDashboardRange(input: {
  startDate?: string | null
  endDate?: string | null
  fy?: string | null
  now?: Date
}): ClientDashboardRange {
  const now = input.now ?? new Date()
  const start = parseIsoDateOnlyStrict(input.startDate)
  const end = parseIsoDateOnlyStrict(input.endDate)
  if (start && end) {
    return start <= end
      ? { rangeStartISO: start, rangeEndISO: end }
      : { rangeStartISO: end, rangeEndISO: start }
  }

  const fromFy = fyParamToRange(input.fy, now)
  if (fromFy) return fromFy

  return currentAuFyRange(now)
}

export function campaignFlightOverlapsRange(
  startDate: unknown,
  endDate: unknown,
  rangeStartISO: string,
  rangeEndISO: string,
): boolean {
  const start = campaignDateOnly(startDate)
  const end = campaignDateOnly(endDate)
  if (!start && !end) return false
  if (start && end) return start <= rangeEndISO && end >= rangeStartISO
  if (start) return start >= rangeStartISO && start <= rangeEndISO
  return end! >= rangeStartISO && end! <= rangeEndISO
}

export type PlannedMonthAmount = { yearMonth: string; amount: number }

/** Inclusive YYYY-MM overlap with [rangeStart, rangeEnd]. */
export function clampMonthlyAmountsToRange(
  months: PlannedMonthAmount[] | undefined,
  rangeStartISO: string,
  rangeEndISO: string,
): number {
  if (!months?.length) return 0
  const from = rangeStartISO.slice(0, 7)
  const to = rangeEndISO.slice(0, 7)
  let sum = 0
  for (const row of months) {
    const key = row.yearMonth.slice(0, 7)
    if (key < from || key > to) continue
    const n = Number(row.amount)
    if (Number.isFinite(n)) sum += n
  }
  return sum
}

export function isoRangeToLocalDates(range: ClientDashboardRange): { start: Date; end: Date } {
  const [sy, sm, sd] = range.rangeStartISO.split("-").map(Number)
  const [ey, em, ed] = range.rangeEndISO.split("-").map(Number)
  return {
    start: new Date(sy!, sm! - 1, sd!, 0, 0, 0, 0),
    end: new Date(ey!, em! - 1, ed!, 23, 59, 59, 999),
  }
}

const FY_MONTH_LABELS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"]

export function exactAuFyStartYear(range: ClientDashboardRange): number | null {
  const m = range.rangeStartISO.match(/^(\d{4})-07-01$/)
  if (!m) return null
  const year = Number(m[1])
  return range.rangeEndISO === `${year + 1}-06-30` ? year : null
}

export type RangeMonthBucket = { key: string; label: string }

/** Calendar months overlapping the range. FY-exact windows keep Jul–Jun labels. */
export function monthBucketsForRange(range: ClientDashboardRange): RangeMonthBucket[] {
  if (exactAuFyStartYear(range) != null) {
    return FY_MONTH_LABELS.map((label) => ({ key: label, label }))
  }

  const buckets: RangeMonthBucket[] = []
  const from = range.rangeStartISO.slice(0, 7)
  const to = range.rangeEndISO.slice(0, 7)
  let [y, m] = from.split("-").map(Number) as [number, number]
  const [ey, em] = to.split("-").map(Number) as [number, number]
  while (y < ey || (y === ey && m <= em)) {
    const key = `${y}-${String(m).padStart(2, "0")}`
    const date = new Date(y, m - 1, 1)
    const label = date.toLocaleString("en-AU", { month: "short", year: "2-digit" })
    buckets.push({ key, label })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return buckets
}

export function fyMonthLabelFromDate(date: Date): string {
  return FY_MONTH_LABELS[(date.getMonth() + 12 - 6) % 12]!
}

const FY_MONTH_INDEX: Record<string, number> = {
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
}

/** Map stacked monthly spend (FY labels or MMM yy) onto YYYY-MM per campaign. */
export function campaignMonthsFromStacked(
  monthly: Array<{ month: string; data: Array<{ campaignName: string; amount: number }> }>,
  range: ClientDashboardRange,
): Map<string, PlannedMonthAmount[]> {
  const fyYear = exactAuFyStartYear(range)
  const labelToKey = new Map<string, string>()
  if (fyYear != null) {
    for (const [label, month] of Object.entries(FY_MONTH_INDEX)) {
      const year = month >= 7 ? fyYear : fyYear + 1
      labelToKey.set(label, `${year}-${String(month).padStart(2, "0")}`)
    }
  } else {
    for (const bucket of monthBucketsForRange(range)) {
      labelToKey.set(bucket.label, bucket.key)
    }
  }

  const out = new Map<string, PlannedMonthAmount[]>()
  for (const row of monthly) {
    const yearMonth = labelToKey.get(row.month)
    if (!yearMonth) continue
    for (const item of row.data) {
      const list = out.get(item.campaignName) ?? []
      list.push({ yearMonth, amount: item.amount })
      out.set(item.campaignName, list)
    }
  }
  return out
}

export function firstQueryParam(value: string | string[] | undefined | null): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value ?? undefined
}

export function rangeFromDashboardSearchParams(
  sp:
    | {
        startDate?: string | string[]
        endDate?: string | string[]
        fy?: string | string[]
      }
    | undefined,
  now?: Date,
): ClientDashboardRange {
  return resolveClientDashboardRange({
    startDate: firstQueryParam(sp?.startDate),
    endDate: firstQueryParam(sp?.endDate),
    fy: firstQueryParam(sp?.fy),
    now,
  })
}
