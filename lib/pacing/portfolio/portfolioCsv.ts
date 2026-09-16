import { downloadCSV } from "@/lib/utils/csv-export"
import { campaignPaceLabel, paceToDisplayBand } from "@/lib/pacing/portfolio/portfolioPresentation"
import type { CampaignPacingRow, ChannelPacingRow } from "@/lib/pacing/portfolio/types"

export type PortfolioCsvRow = {
  level: "campaign" | "channel"
  client: string
  campaign: string
  mba: string
  channel: string
  pace: string
  timePct: string
  spendPct: string
  spent: number
  budget: number
  projected: number | ""
  yesterday: number | ""
  kpis: string
  why: string
}

const CSV_HEADERS: Record<keyof PortfolioCsvRow, string> = {
  level: "level",
  client: "client",
  campaign: "campaign",
  mba: "mba",
  channel: "channel",
  pace: "pace",
  timePct: "time_pct",
  spendPct: "spend_pct",
  spent: "spent",
  budget: "budget",
  projected: "projected",
  yesterday: "yesterday",
  kpis: "kpis",
  why: "why",
}

function channelPaceLabel(channel: ChannelPacingRow): string {
  switch (paceToDisplayBand(channel.pace)) {
    case "behind":
      return "Behind"
    case "on-track":
      return "On track"
    case "ahead":
      return "Ahead"
    case "over-pacing":
      return "Over-pacing"
    case "no-data":
      return "No data"
    default:
      return channel.pace
  }
}

export function flattenPortfolioCsvRows(rows: CampaignPacingRow[]): PortfolioCsvRow[] {
  const out: PortfolioCsvRow[] = []
  for (const row of rows) {
    out.push({
      level: "campaign",
      client: row.clientName,
      campaign: row.campaignName,
      mba: row.mbaNumber,
      channel: "",
      pace: campaignPaceLabel(row),
      timePct: String(row.timePct),
      spendPct: String(row.spendPct),
      spent: row.spendToDate,
      budget: row.budget,
      projected: row.projectedFinish ?? "",
      yesterday: row.spendYesterday,
      kpis: row.kpi ? `${row.kpi.tracked} of ${row.kpi.total}` : "",
      why: row.why,
    })
    for (const channel of row.channels) {
      out.push({
        level: "channel",
        client: row.clientName,
        campaign: row.campaignName,
        mba: row.mbaNumber,
        channel: channel.label,
        pace: channelPaceLabel(channel),
        timePct: "",
        spendPct: String(channel.spendPct),
        spent: channel.spendToDate,
        budget: channel.budget,
        projected: "",
        yesterday: "",
        kpis: "",
        why: "",
      })
    }
  }
  return out
}

export function downloadPortfolioCsv(rows: CampaignPacingRow[], asOf: string): void {
  downloadCSV(flattenPortfolioCsvRows(rows), `pacing-portfolio-${asOf}`, CSV_HEADERS)
}
