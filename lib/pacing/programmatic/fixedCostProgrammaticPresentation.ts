import type { ProgrammaticPacingCampaignRow } from "./types"

/**
 * Part 4: fixed-cost programmatic money lives on /pacing/direct.
 * Keep delivery (impressions / views / VTR); drop spend-derived CPM/CPV
 * and spend-pacing Behind from AMOUNT_SPENT = 0.
 */
export function applyFixedCostProgrammaticDeliveryPresentation(
  row: ProgrammaticPacingCampaignRow,
): void {
  if (row.fixedCostMedia !== true) {
    row.spendPacingDeferredToDirect = false
    return
  }
  row.cpm = null
  row.cpv = null
  row.spendPacingDeferredToDirect = true
  const hasDelivery = row.impressions > 0 || row.videoViews > 0 || row.clicks > 0
  row.lineItemStatus = hasDelivery ? "on-track" : "no-data"
}
