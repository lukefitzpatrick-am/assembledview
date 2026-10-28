/**
 * KPI table rows for the campaign report deck.
 *
 * CPV is never a saved target (Luke, 23 Oct 2026): the plan CPV is the CPV
 * target, and saved `campaign_kpi.cpv` is not read. The deck's KPI table has
 * no CPV row. Each channel slide shows delivered CPV and, when the channel has
 * CPV-bought lines, that channel's plan CPV as the target
 * (`channelPlanCpvTarget`). It is never averaged across channels.
 *
 * VTR (REP-4) is completed views ÷ impressions over video lines that report
 * completions (`videoCompletionFeed`). Frequency has no reach data, so its
 * delivered value stays empty and the deck says it is not tracked yet.
 */
import type { DeliveryChannelGroup } from "@/lib/ava/tools/summaries"
import { groupsFromDeliverySnapshot } from "@/lib/campaign-read/kpiRead"
import { isCpvBuyType, resolveCpvPlanRate } from "@/lib/kpi/kpiReview"
import { buildLineItemKpiTargetMap } from "@/lib/kpi/lineItemKpiTargets"
import {
  classifyStoredKpiPercentForScan,
  formatStoredDecimalAsPercent,
  KPI_RATIO_PERCENT_METRICS,
} from "@/lib/kpi/percentUnits"
import { CLIENT_KPI_METRIC_LABELS, type CampaignKPI } from "@/lib/kpi/types"
import type { CampaignReportKpiRow } from "@/lib/reports/campaignReport/assembleCampaignReportData"
import { isBlankKpiTarget } from "@/lib/reports/campaignReport/reportFigures"

/**
 * One channel's plan CPV target: the KPI review's plan rate
 * (`resolveCpvPlanRate`) over that channel's CPV-bought lines only. Lines on
 * different plan CPVs are weighted by planned spend, as the KPI review card
 * does. Null when the channel has no CPV-bought line or no plan rate.
 */
export function channelPlanCpvTarget(
  channel: DeliveryChannelGroup,
  kpiRows: CampaignKPI[],
): number | null {
  const lines = channel.lines.filter((line) => isCpvBuyType(line.buyType))
  if (lines.length === 0) return null
  const [group] = groupsFromDeliverySnapshot([{ ...channel, lines }])
  if (!group) return null
  const plan = resolveCpvPlanRate(group, buildLineItemKpiTargetMap(kpiRows))
  return plan && Number.isFinite(plan.value) && plan.value > 0 ? plan.value : null
}

/**
 * Groups whose `video3sViews` are completed views (CM360 `VIDEO_3S_VIEWS`
 * holds completions; DSP video the same). Social 3-second views are not
 * completions, so social stays out of the campaign VTR.
 */
const COMPLETION_VIEW_GROUPS = new Set(["programmatic_video", "digital_video", "bvod"])

/**
 * Completed views and the impressions they came from, for the campaign VTR.
 * Only reported lines that carry completions count, so display impressions
 * and video lines without completion tracking do not dilute the rate.
 */
export function videoCompletionFeed(channels: readonly DeliveryChannelGroup[]): {
  completions: number
  impressions: number
} {
  let completions = 0
  let impressions = 0
  for (const channel of channels) {
    if (!COMPLETION_VIEW_GROUPS.has(channel.group)) continue
    for (const line of channel.lines) {
      if (line.deliveryState !== "reported") continue
      if (!(line.video3sViews > 0) || !(line.impressions > 0)) continue
      completions += line.video3sViews
      impressions += line.impressions
    }
  }
  return { completions, impressions }
}

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
  feed: {
    impressions: number
    clicks: number
    results: number
    spend: number
    /** Completed views on video lines (`videoCompletionFeed`). */
    videoCompletions?: number
    /** Impressions on the same video lines. */
    videoImpressions?: number
  },
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
    } else if (
      metric === "vtr" &&
      (feed.videoImpressions ?? 0) > 0 &&
      (feed.videoCompletions ?? 0) > 0
    ) {
      actual = (feed.videoCompletions ?? 0) / (feed.videoImpressions ?? 0)
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
