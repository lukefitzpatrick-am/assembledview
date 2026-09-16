import type { CampaignPacingRow, PortfolioPacingCounts } from "./types"

/** Client-safe flags + counts. Do not import assembleCampaignPacingRows from a client graph. */
export function isOverPacing(
  row: Pick<CampaignPacingRow, "spendPct" | "projectedFinish" | "budget">,
): boolean {
  return (
    row.spendPct > 110 &&
    row.projectedFinish != null &&
    row.budget > 0 &&
    row.projectedFinish > row.budget * 1.15
  )
}

export function isAttentionRow(row: CampaignPacingRow): boolean {
  return (
    isOverPacing(row) ||
    row.pace === "no_delivery" ||
    row.pace === "no_source" ||
    row.pace === "behind"
  )
}

export function countPortfolioRows(rows: CampaignPacingRow[]): PortfolioPacingCounts {
  return {
    live: rows.length,
    behind: rows.filter((r) => r.pace === "behind").length,
    on_track: rows.filter((r) => r.pace === "on_track").length,
    ahead: rows.filter((r) => r.pace === "ahead").length,
    over_pacing: rows.filter(isOverPacing).length,
    attention: rows.filter(isAttentionRow).length,
  }
}
