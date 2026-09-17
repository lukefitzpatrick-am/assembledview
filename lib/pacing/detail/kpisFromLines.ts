import type { KpiReviewCard, KpiReviewRow } from "@/lib/kpi/kpiReview"
import type { LineCardKpi, LineCardModel } from "@/lib/pacing/channel/lineCardTypes"
import type { DeliveryStatus } from "@/lib/pacing/deliveryStatusFromPct"

const CHANNEL_LABEL: Record<LineCardModel["channel"], string> = {
  search: "Search",
  social: "Social",
  programmatic: "Programmatic",
  "ad-serving": "Ad serving",
  direct: "Direct",
}

function reviewStatus(kpi: LineCardKpi): DeliveryStatus {
  if (kpi.status === "on-track") return "on-track"
  if (kpi.status === "off-target") return "behind"
  return "no-data"
}

function caption(kpi: LineCardKpi): string | null {
  if (kpi.source === "benchmark") return "industry benchmark"
  if (kpi.source === "rate") return "plan rate"
  if (kpi.source === "target") return "plan target"
  return null
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
    targetCaption: caption(kpi),
  }
}

/** Dashboard-review shaped cards from V1 line KPI chips, grouped by channel. */
export function kpisFromLines(lines: readonly LineCardModel[]): KpiReviewCard[] {
  const byChannel = new Map<string, { label: string; rows: KpiReviewRow[] }>()
  for (const line of lines) {
    if (line.kpis.length === 0) continue
    const key = line.channel
    const existing = byChannel.get(key) ?? { label: `${CHANNEL_LABEL[key]} · ${line.platform}`, rows: [] }
    if (!byChannel.has(key)) existing.label = `${CHANNEL_LABEL[key]} · ${line.platform}`
    existing.rows.push(...line.kpis.map(rowFromChip))
    byChannel.set(key, existing)
  }
  return [...byChannel.entries()].map(([key, group]) => {
    const rows = group.rows.filter((row) => !row.omitted || row.targetCaption)
    return {
      key,
      label: group.label,
      colour: "",
      rows,
      noTargets: rows.length === 0,
    }
  })
}
