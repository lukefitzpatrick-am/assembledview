import type { DeliveryChannelGroup, DeliveryLineSnapshot } from "@/lib/ava/tools/summaries"
import {
  buildKpiReview,
  kpiRowEligibleForReadBeat,
  type KpiReviewCard,
  type KpiReviewGroup,
  type KpiReviewPlanLine,
} from "@/lib/kpi/kpiReview"
import { buildLineItemKpiTargetMap } from "@/lib/kpi/lineItemKpiTargets"
import type { CampaignKPI } from "@/lib/kpi/types"

export { kpiRowEligibleForReadBeat }

function countsTowardSpend(state: DeliveryLineSnapshot["deliveryState"]): boolean {
  return state === "reported" || state === "spend_only"
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

/** Plan fields the KPI review reads, from a delivery snapshot line. */
export function planLineFromSnapshot(line: DeliveryLineSnapshot): KpiReviewPlanLine {
  return {
    buyType: line.buyType ?? "",
    plannedSpend: typeof line.plannedBudget === "number" ? line.plannedBudget : 0,
    buyAmount: positiveOrNull(line.planBuyRate),
    plannedViews: positiveOrNull(line.plannedViews),
    plannedImpressions: positiveOrNull(line.plannedImpressions),
    plannedClicks: positiveOrNull(line.plannedClicks),
  }
}

export function groupsFromDeliverySnapshot(channels: readonly DeliveryChannelGroup[]): KpiReviewGroup[] {
  return channels.map((ch) => {
    // C1b: Meta, TikTok and Reddit VTR is 3-second views ÷ impressions.
    const vtrThreeSecondViews =
      ch.group === "social_meta" || ch.group === "social_tiktok" || ch.group === "social_reddit"
    const vtrTracked = ch.group === "programmatic_video" || vtrThreeSecondViews
    let impressions = 0
    let clicks = 0
    let results = 0
    let video3sViews = 0
    let spend = 0
    const plannedSpendByLineId: Record<string, number> = {}
    const planByLineId: Record<string, KpiReviewPlanLine> = {}
    for (const line of ch.lines) {
      if (typeof line.plannedBudget === "number") {
        plannedSpendByLineId[line.lineItemId] = line.plannedBudget
      }
      // CPV target is the plan CPV (23 Oct): the review reads it from the plan line.
      planByLineId[line.lineItemId] = planLineFromSnapshot(line)
      if (line.deliveryState === "reported") {
        impressions += line.impressions
        clicks += line.clicks
        results += line.results
        video3sViews += line.video3sViews
      }
      if (countsTowardSpend(line.deliveryState)) spend += line.spendToDate
    }
    return {
      key: ch.group,
      label: ch.group,
      colour: "",
      lineItemIds: ch.lines.map((line) => line.lineItemId),
      plannedSpendByLineId,
      planByLineId,
      impressions,
      clicks,
      results,
      views: video3sViews > 0 ? video3sViews : null,
      completes: vtrTracked && video3sViews > 0 ? video3sViews : null,
      spend,
      spendModelled: false,
      vtrTracked,
      vtrThreeSecondViews,
    }
  })
}

export function compactKpiReviewForRead(cards: readonly KpiReviewCard[]): unknown {
  return cards.map((card) => ({
    key: card.key,
    label: card.label,
    rows: card.rows.map((row) => ({
      metric: row.metric,
      label: row.label,
      targetDisplay: row.targetDisplay,
      deliveredDisplay: row.deliveredDisplay,
      status: row.status,
      eligibleForBestWorst: kpiRowEligibleForReadBeat(row),
    })),
  }))
}

export function buildKpiReviewPayloadForRead(input: {
  channels: readonly DeliveryChannelGroup[]
  kpis: CampaignKPI[]
}): unknown {
  const cards = buildKpiReview({
    groups: groupsFromDeliverySnapshot(input.channels),
    lineItemTargets: buildLineItemKpiTargetMap(input.kpis),
    isAdmin: true,
  })
  return compactKpiReviewForRead(cards)
}
