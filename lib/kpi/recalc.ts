import type { ResolvedKPIRow } from "./types"

/** Recompute derived delivery metrics from KPI fields and buy type (mirrors resolveKPIs). */
export function recalcRow(row: ResolvedKPIRow): ResolvedKPIRow {
  const bt = (row.buyType ?? "").toLowerCase()
  const isClick = ["cpc", "cpa", "cpl"].some((t) => bt.includes(t))
  const isView = ["cpv", "vtr"].some((t) => bt.includes(t))
  return {
    ...row,
    calculatedClicks: isClick ? row.deliverables : Math.round(row.deliverables * row.ctr),
    calculatedViews: isView ? row.deliverables : Math.round(row.deliverables * row.vtr),
    calculatedReach: row.frequency > 0 ? Math.round(row.deliverables / row.frequency) : 0,
  }
}

/** Preserve user-edited KPI metrics when line items are rebuilt. */
export function mergeManualKpiOverrides(
  resolved: ResolvedKPIRow[],
  previous: ResolvedKPIRow[],
): ResolvedKPIRow[] {
  const prevById = new Map(previous.map((r) => [r.lineItemId, r]))
  return resolved.map((r) => {
    const p = prevById.get(r.lineItemId)
    if (!p?.isManuallyEdited) return r
    return recalcRow({
      ...r,
      ctr: p.ctr,
      cpv: p.cpv,
      conversion_rate: p.conversion_rate,
      vtr: p.vtr,
      frequency: p.frequency,
      isManuallyEdited: true,
      source: "manual",
    })
  })
}
