import { downloadCSV } from "@/lib/utils/csv-export"
import { copyForRowKpiStatus } from "@/lib/pacing/kpi/computeKpiStatus"
import type { LineCardModel } from "./lineCardTypes"

function paceLabel(model: LineCardModel): string {
  switch (model.pace) {
    case "behind":
      return "Behind"
    case "on_track":
      return "On track"
    case "ahead":
      return "Ahead"
    case "over_pacing":
      return "Over-pacing"
    case "no_data":
      return "No data"
    default: {
      const _exhaustive: never = model.pace
      return _exhaustive
    }
  }
}

export function flattenLineCardCsvRows(models: LineCardModel[]): Record<string, string | number>[] {
  return models.map((model) => {
    const extras = Object.fromEntries(
      model.metrics.map((metric, index) => [`metric_${index + 1}_${metric.label}`, metric.value]),
    )
    return {
      client: model.client,
      campaign: model.campaignName,
      mba: model.mba,
      line_item_id: model.lineItemId,
      platform: model.platform,
      pace: paceLabel(model),
      kpi_status: model.kpiStatus ? copyForRowKpiStatus(model.kpiStatus) : "",
      time_pct: Math.round(model.timePct),
      line_pct: Math.round(model.linePct),
      burst_pct: model.burstPct == null ? "" : Math.round(model.burstPct),
      spend: model.spend,
      budget: model.budget,
      burst_spend: model.burstSpend ?? "",
      burst_budget: model.burstBudget ?? "",
      remaining_line: model.remainingLine,
      per_day_left: model.perDayLeft ?? "",
      yesterday: model.yesterday,
      bursts: model.bursts.index ? `${model.bursts.index} of ${model.bursts.total}` : `${model.bursts.total}`,
      line_start: model.lineStart ?? "",
      line_end: model.lineEnd ?? "",
      targeting: model.targeting,
      spend_mode: model.spendMode ?? "",
      why: model.why,
      ...extras,
    }
  })
}

export function downloadLineCardCsv(models: LineCardModel[], asOf: string, channel: string): void {
  downloadCSV(flattenLineCardCsvRows(models), `pacing-${channel}-${asOf}`)
}
