import type { ResolvedKPIRow } from "@/types/kpi"
import { recalcRow } from "./recalcRow"

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
