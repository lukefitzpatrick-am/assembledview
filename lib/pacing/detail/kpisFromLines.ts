import type { KpiReviewRow } from "@/lib/kpi/kpiReview"
import type { LineCardKpi, LineCardModel } from "@/lib/pacing/channel/lineCardTypes"
import type { DeliveryStatus } from "@/lib/pacing/deliveryStatusFromPct"

export const KPI_NOT_TRACKED_FOR_SOURCE = "Not tracked for this source"

export type CampaignDetailKpiCard = {
  key: string
  lineItemId: string
  name: string
  channelPlatform: string
  buyType: string | null
  budget: number
  rows: KpiReviewRow[]
  untracked: boolean
}

function reviewStatus(kpi: LineCardKpi): DeliveryStatus {
  if (kpi.status === "on-track") return "on-track"
  if (kpi.status === "off-target") return "behind"
  return "no-data"
}

/** Shared target caption: plan target / industry benchmark / plan rate / No target set. */
export function kpiTargetCaption(kpi: Pick<LineCardKpi, "source">): string {
  if (kpi.source === "benchmark") return "industry benchmark"
  if (kpi.source === "rate") return "plan rate"
  if (kpi.source === "target") return "plan target"
  return "No target set"
}

export function lineKpiChannelPlatform(line: Pick<LineCardModel, "channel" | "platform">): string {
  return [line.channel, line.platform].filter(Boolean).join(" · ")
}

function rowFromChip(kpi: LineCardKpi): KpiReviewRow {
  return {
    metric: "ctr",
    label: kpi.label,
    targetDisplay: kpi.target || "No target set",
    deliveredDisplay: kpi.delivered,
    status: reviewStatus(kpi),
    omitted: kpi.status === "no-target" || kpi.status == null,
    targetSource: kpi.source === "benchmark" || kpi.source === "target" ? kpi.source : null,
    targetCaption: kpiTargetCaption(kpi),
  }
}

function isUntracked(kpi: LineCardKpi): boolean {
  return kpi.delivered === KPI_NOT_TRACKED_FOR_SOURCE
}

/** One card per line, with that line's KPI chips underneath. */
export function kpisFromLines(lines: readonly LineCardModel[]): CampaignDetailKpiCard[] {
  return lines.map((line) => {
    const untracked = line.kpis.length > 0 && line.kpis.every(isUntracked)
    return {
      key: line.lineItemId,
      lineItemId: line.lineItemId,
      name: line.campaignName,
      channelPlatform: lineKpiChannelPlatform(line),
      buyType: line.buyType,
      budget: line.budget,
      rows: untracked ? [] : line.kpis.map(rowFromChip),
      untracked,
    }
  })
}
