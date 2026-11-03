import { normalizeDailyFactDate } from "@/lib/snowflake/normalizeDate"
import { fromCents, toCents } from "@/lib/money/cents"

export type ReportedSpendDay = {
  lineItemId: string
  dateDay: string
  reportedSpend: number
}

function cleanLineId(value: string): string {
  return String(value ?? "").trim().toLowerCase()
}

/** Index REPORTED_SPEND by lowercased line_item_id then DATE_DAY. Duplicate days sum. */
export function indexReportedSpendByLineDate(
  days: readonly ReportedSpendDay[],
): Map<string, Map<string, number>> {
  const byLine = new Map<string, Map<string, number>>()
  for (const day of days) {
    const id = cleanLineId(day.lineItemId)
    const dateDay = normalizeDailyFactDate(day.dateDay) ?? ""
    if (!id || !dateDay) continue
    const spend = Number(day.reportedSpend)
    if (!Number.isFinite(spend)) continue
    let byDate = byLine.get(id)
    if (!byDate) {
      byDate = new Map()
      byLine.set(id, byDate)
    }
    byDate.set(dateDay, (byDate.get(dateDay) ?? 0) + spend)
  }
  return byLine
}

/** Replace PACING_FACT spend with reported spend. Missing days become 0. */
export function overlayReportedSpendOnActuals(
  actualsDaily: Array<{ date: string; spend: number }>,
  byDate: Map<string, number> | undefined,
): void {
  for (const day of actualsDaily) {
    day.spend = byDate?.get(day.date) ?? 0
  }
}

/**
 * B23 FC2: per-day merge for a line with a fixed cost from date. Days before
 * the date keep the line's actual (platform, modelled or estimated) spend.
 * From the date a day takes its reported row; a day with no reported row yet
 * keeps the actual, so it never reads as $0.
 */
export function mergeReportedSpendFromDate(
  actualsDaily: Array<{ date: string; spend: number }>,
  byDate: Map<string, number> | undefined,
  fromDay: string,
): void {
  for (const day of actualsDaily) {
    if (day.date < fromDay) continue
    const reported = byDate?.get(day.date)
    if (reported !== undefined) day.spend = reported
  }
}

/**
 * B23 FC2: spend for a window with the same per-day rule, summed in cents.
 * `actualByDate` holds the line's actual spend per day.
 */
export function mergedSpendInWindow(input: {
  actualByDate: ReadonlyMap<string, number>
  reportedByDate: ReadonlyMap<string, number> | undefined
  fromDay: string
  startDate?: string
  endDate?: string
}): { spend: number; reportedDays: number } {
  const days = new Set<string>([...input.actualByDate.keys()])
  for (const day of input.reportedByDate?.keys() ?? []) if (day >= input.fromDay) days.add(day)
  let cents = 0
  let reportedDays = 0
  for (const day of days) {
    if (input.startDate && day < input.startDate) continue
    if (input.endDate && day > input.endDate) continue
    const reported = day >= input.fromDay ? input.reportedByDate?.get(day) : undefined
    if (reported !== undefined) reportedDays += 1
    const value = reported ?? input.actualByDate.get(day) ?? 0
    if (Number.isFinite(value)) cents += toCents(value)
  }
  return { spend: fromCents(cents), reportedDays }
}

/**
 * B23 FC2: one daily spend series for a dated line. Before the date the
 * actual; from the date the reported row, else the actual.
 */
export function mergedDailyFromDate(
  actualByDate: ReadonlyMap<string, number>,
  reportedByDate: ReadonlyMap<string, number> | undefined,
  fromDay: string,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const [day, value] of actualByDate) out.set(day, value)
  for (const [day, value] of reportedByDate ?? []) {
    if (day >= fromDay) out.set(day, value)
  }
  return out
}

export function sumReportedSpend(byDate: Map<string, number> | undefined): number {
  if (!byDate) return 0
  let sum = 0
  for (const value of byDate.values()) sum += value
  return sum
}

/** Map FIXED_COST_REPORTED_DAILY_FACT rows without a second Snowflake query. */
export function reportedSpendDaysFromDailyFacts(
  rows: ReadonlyArray<{
    LINE_ITEM_ID?: unknown
    DATE_DAY?: unknown
    REPORTED_SPEND?: unknown
  }>,
): ReportedSpendDay[] {
  return rows.map((row) => ({
    lineItemId: String(row.LINE_ITEM_ID ?? "").trim(),
    dateDay: normalizeDailyFactDate(row.DATE_DAY) ?? "",
    reportedSpend: Number(row.REPORTED_SPEND),
  }))
}
