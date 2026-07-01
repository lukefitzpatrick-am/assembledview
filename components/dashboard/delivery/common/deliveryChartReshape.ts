import type { TargetCurvePoint } from "@/lib/kpi/deliveryTargetCurve"
import { getMelbourneTodayISO } from "@/lib/pacing/pacingWindow"

function formatChartDateLabel(iso: string | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short" }).format(d)
}

/** Reshape target curve + cumulative actuals into PacingBandChart props (CHART-INDEX shape). */
export function reshapeCumulativeToPacingBand(
  targetCurve: TargetCurvePoint[],
  cumulativeActual: Array<{ date: string; actual: number }>,
  asAtDate: string | null,
) {
  const actualByDate = new Map(cumulativeActual.map((r) => [r.date, r.actual]))
  const finalTarget = targetCurve[targetCurve.length - 1]?.target ?? 0
  const denom = finalTarget > 0 ? finalTarget : 1

  const actual = targetCurve.map((p) => ((actualByDate.get(p.date) ?? 0) / denom) * 100)
  const target = targetCurve.map((p) => (p.target / denom) * 100)
  const bandLow = targetCurve.map((p) => (p.targetLow / denom) * 100)
  const bandHigh = targetCurve.map((p) => (p.targetHigh / denom) * 100)

  const refISO = asAtDate ?? getMelbourneTodayISO()
  const todayIndex = targetCurve.findIndex((p) => p.date === refISO)

  const step = Math.max(1, Math.floor(targetCurve.length / 7))
  const weekLabels = targetCurve.map((p, i) =>
    i === 0 || i === targetCurve.length - 1 || i % step === 0 ? formatChartDateLabel(p.date) : "",
  )

  return {
    actual,
    target,
    bandLow,
    bandHigh,
    weekLabels,
    todayIndex: todayIndex >= 0 ? todayIndex : undefined,
    ymax: 100,
  }
}

/** Add a display label for the x-axis without mutating adapter daily rows. */
export function withDateLabels(
  daily: Array<Record<string, string | number>>,
): Array<Record<string, string | number>> {
  return daily.map((row) => ({
    ...row,
    dateLabel: formatChartDateLabel(String(row.date ?? "")),
  }))
}
