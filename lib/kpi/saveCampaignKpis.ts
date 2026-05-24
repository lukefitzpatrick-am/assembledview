import type { CampaignKPI, ResolvedKPIRow } from "./types"
import { syncCampaignKPIs } from "@/lib/api/kpi"

export type CampaignKpiSaveResult =
  | { status: "skipped" }
  | { status: "success" }
  | { status: "error"; message: string }

/**
 * Persist fan-out KPI rows via server-side sync (PATCH-or-POST keyed by
 * mba_number + version_number + line_item_id). Surfaces match/save failures
 * for save-status UI.
 */
export async function saveCampaignKpisFromRows(
  kpiRows: ResolvedKPIRow[],
  payload: CampaignKPI[],
): Promise<CampaignKpiSaveResult> {
  if (kpiRows.length === 0) {
    return { status: "skipped" }
  }
  if (payload.length === 0) {
    return {
      status: "error",
      message:
        "Could not match KPI rows to line items. Save line items first, then retry.",
    }
  }
  if (payload.length < kpiRows.length) {
    return {
      status: "error",
      message: `Only ${payload.length} of ${kpiRows.length} KPI rows matched line items; save line items first, then retry.`,
    }
  }
  try {
    await syncCampaignKPIs(payload)
    return { status: "success" }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: "error", message }
  }
}
