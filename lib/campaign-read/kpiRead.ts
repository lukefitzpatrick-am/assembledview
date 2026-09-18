import type { DeliveryChannelGroup, DeliveryLineSnapshot } from "@/lib/ava/tools/summaries"
import {
  buildKpiReview,
  kpiRowEligibleForReadBeat,
  type KpiReviewCard,
  type KpiReviewGroup,
} from "@/lib/kpi/kpiReview"
import { buildLineItemKpiTargetMap } from "@/lib/kpi/lineItemKpiTargets"
import type { CampaignKPI } from "@/lib/kpi/types"

export { kpiRowEligibleForReadBeat }

function countsTowardSpend(state: DeliveryLineSnapshot["deliveryState"]): boolean {
  return state === "reported" || state === "spend_only"
}

export function groupsFromDeliverySnapshot(channels: readonly DeliveryChannelGroup[]): KpiReviewGroup[] {
  return channels.map((ch) => {
    const vtrTracked = ch.group === "programmatic_video"
    let impressions = 0
    let clicks = 0
    let results = 0
    let video3sViews = 0
    let spend = 0
    const plannedSpendByLineId: Record<string, number> = {}
    for (const line of ch.lines) {
      if (typeof line.plannedBudget === "number") {
        plannedSpendByLineId[line.lineItemId] = line.plannedBudget
      }
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
      planByLineId: {},
      impressions,
      clicks,
      results,
      views: video3sViews > 0 ? video3sViews : null,
      completes: vtrTracked && video3sViews > 0 ? video3sViews : null,
      spend,
      spendModelled: false,
      vtrTracked,
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
