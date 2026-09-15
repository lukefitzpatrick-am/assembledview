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
    const dateDay = String(day.dateDay ?? "").slice(0, 10)
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
    dateDay: String(row.DATE_DAY ?? "").slice(0, 10),
    reportedSpend: Number(row.REPORTED_SPEND),
  }))
}
