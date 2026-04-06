import type { ResolvedKPIRow } from "@/types/kpi"

/** Recompute derived delivery metrics from KPI fields and buy type (mirrors resolveKPIs). */
export function recalcRow(row: ResolvedKPIRow): ResolvedKPIRow {
  const bt = (row.buyType ?? "").toLowerCase()
  const isClick = ["cpc", "cpa", "cpl"].some((t) => bt.includes(t))
  const isView = ["cpv", "vtr"].some((t) => bt.includes(t))
  return {
    ...row,
    calculatedClicks: isClick ? row.deliverables : Math.round(row.deliverables * row.ctr),
    calculatedViews: isView ? row.deliverables : Math.round(row.deliverables * row.vtr),
    calculatedReach:
      row.frequency > 0 ? Math.round(row.deliverables / row.frequency) : 0,
  }
}
