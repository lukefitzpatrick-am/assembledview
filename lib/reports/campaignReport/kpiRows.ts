/**
 * KPI table rows for the campaign report deck.
 *
 * CPV is never a saved target (Luke, 23 Oct 2026): the plan CPV is the CPV
 * target, and saved `campaign_kpi.cpv` is not read. The deck's KPI table has
 * no CPV row; channel slides show delivered CPV.
 */
import {
  classifyStoredKpiPercentForScan,
  formatStoredDecimalAsPercent,
  KPI_RATIO_PERCENT_METRICS,
} from "@/lib/kpi/percentUnits"
import { CLIENT_KPI_METRIC_LABELS, type CampaignKPI } from "@/lib/kpi/types"
import type { CampaignReportKpiRow } from "@/lib/reports/campaignReport/assembleCampaignReportData"
import { isBlankKpiTarget } from "@/lib/reports/campaignReport/reportFigures"

function firstTarget(
  rows: CampaignKPI[],
  metric: "ctr" | "conversion_rate" | "vtr" | "frequency",
): number | null {
  for (const row of rows) {
    const raw = row[metric]
    if (isBlankKpiTarget(raw)) continue
    const n = typeof raw === "number" ? raw : Number(raw)
    if (Number.isFinite(n)) return n
  }
  return null
}

export function buildKpiRows(
  kpiRows: CampaignKPI[],
  feed: { impressions: number; clicks: number; results: number; spend: number },
): CampaignReportKpiRow[] {
  const ratioSet = new Set<string>(KPI_RATIO_PERCENT_METRICS)
  const metrics = ["ctr", "conversion_rate", "vtr", "frequency"] as const
  const out: CampaignReportKpiRow[] = []

  for (const metric of metrics) {
    const target = firstTarget(kpiRows, metric)
    if (target === null) continue
    const label = CLIENT_KPI_METRIC_LABELS[metric] ?? metric

    if (ratioSet.has(metric)) {
      const scan = classifyStoredKpiPercentForScan(target)
      if (scan.ambiguous || scan.inferredUnit === "percent_points" || scan.inferredUnit === "anomalous") {
        out.push({
          metric,
          label,
          targetDisplay: "—",
          actualDisplay: null,
          omitted: true,
          omitReason: "Pending KPI data review",
        })
        continue
      }
    }

    let actual: number | null = null
    if (metric === "ctr" && feed.impressions > 0) {
      actual = feed.clicks / feed.impressions
    } else if (metric === "conversion_rate" && feed.clicks > 0) {
      actual = feed.results / feed.clicks
    }

    const targetDisplay = ratioSet.has(metric)
      ? formatStoredDecimalAsPercent(target)
      : String(target)

    const actualDisplay =
      actual == null
        ? null
        : ratioSet.has(metric)
          ? formatStoredDecimalAsPercent(actual)
          : String(actual)

    out.push({
      metric,
      label,
      targetDisplay,
      actualDisplay,
      omitted: false,
    })
  }

  return out
}
