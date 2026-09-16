import { compareValues, type SortDirection } from "@/components/ui/sortable-table-header"
import { campaignDisplayBand } from "@/lib/pacing/portfolio/portfolioPresentation"
import type { CampaignPacingRow } from "@/lib/pacing/portfolio/types"

export type PortfolioSortColumn =
  | "pace"
  | "timePct"
  | "spendPct"
  | "spent"
  | "budget"
  | "projected"
  | "yesterday"

const PACE_RANK: Record<ReturnType<typeof campaignDisplayBand>, number> = {
  "over-pacing": 0,
  behind: 1,
  "no-data": 2,
  ahead: 3,
  "on-track": 4,
}

export function portfolioSortValue(
  row: CampaignPacingRow,
  column: PortfolioSortColumn,
): string | number | null {
  switch (column) {
    case "pace":
      return PACE_RANK[campaignDisplayBand(row)]
    case "timePct":
      return row.timePct
    case "spendPct":
      return row.spendPct
    case "spent":
      return row.spendToDate
    case "budget":
      return row.budget
    case "projected":
      return row.projectedFinish
    case "yesterday":
      return row.spendYesterday
    default: {
      const _exhaustive: never = column
      return _exhaustive
    }
  }
}

export function sortCampaignPacingRows(
  rows: CampaignPacingRow[],
  column: PortfolioSortColumn | null,
  direction: Exclude<SortDirection, null>,
): CampaignPacingRow[] {
  if (!column) return rows
  return rows.toSorted((a, b) =>
    compareValues(portfolioSortValue(a, column), portfolioSortValue(b, column), direction),
  )
}
