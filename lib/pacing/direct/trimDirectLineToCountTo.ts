import type { DirectBurstRow, DirectLineItemRow } from "@/lib/pacing/direct/types"

type AfterSums = { reported: number; actual: number; deliverables: number }

function emptySums(): AfterSums {
  return { reported: 0, actual: 0, deliverables: 0 }
}

function trimBurst(burst: DirectBurstRow, after: AfterSums | undefined): DirectBurstRow {
  if (!after) return burst
  const reportedSpend = burst.reportedSpend - after.reported
  const actualPlatformSpend = burst.actualPlatformSpend - after.actual
  const actualDeliverables = burst.actualDeliverables - after.deliverables
  return {
    ...burst,
    reportedSpend,
    actualPlatformSpend,
    // FIXED_COST_BURST_FACT: variance = reported − actual; ratio = actual ÷ expected.
    variance: reportedSpend - actualPlatformSpend,
    actualDeliverables,
    deliveryRatio:
      burst.expectedDeliverables > 0 ? actualDeliverables / burst.expectedDeliverables : burst.deliveryRatio,
  }
}

/**
 * Stops a direct (fixed-cost and assumed-spend) line at the count-to day (P1).
 *
 * The mart totals include every reported day, today among them. The daily
 * rows after `countToDate` are taken off the line and burst totals, so the
 * mart's own totals stay the base. The daily series is left whole for charts.
 * A line with nothing after the count-to day is returned unchanged.
 */
export function trimDirectLineToCountTo(
  line: DirectLineItemRow,
  countToDate: string,
): DirectLineItemRow {
  const total = emptySums()
  const byBurst = new Map<number, AfterSums>()
  let any = false
  for (const day of line.daily) {
    if (day.dateDay <= countToDate) continue
    if (day.reportedSpend === 0 && day.actualPlatformSpend === 0 && day.actualDeliverables === 0) continue
    any = true
    total.reported += day.reportedSpend
    total.actual += day.actualPlatformSpend
    total.deliverables += day.actualDeliverables
    const bucket = byBurst.get(day.burstIndex) ?? emptySums()
    bucket.reported += day.reportedSpend
    bucket.actual += day.actualPlatformSpend
    bucket.deliverables += day.actualDeliverables
    byBurst.set(day.burstIndex, bucket)
  }
  if (!any) return line
  const totalReported = line.totalReported - total.reported
  const totalActual = line.totalActual - total.actual
  const variance = totalReported - totalActual
  return {
    ...line,
    totalReported,
    totalActual,
    variance,
    variancePct: totalReported > 0 ? variance / totalReported : null,
    bursts: line.bursts.map((burst) => trimBurst(burst, byBurst.get(burst.burstIndex))),
  }
}
