/**
 * Channel KPI-band target line — same group resolver as the MBA KPI review.
 */

import type { KpiTileProps } from "@/components/dashboard/delivery/shared/KpiTile"
import { formatMoney } from "@/lib/format/money"
import type { CampaignKPI } from "@/lib/kpi/types"
import {
  extractKpiReviewPlanLine,
  formatTarget,
  resolveCpcPlanRate,
  resolveCpmPlanRate,
  resolveCpvPlanRate,
  resolveGroupTarget,
  statusForCostMetric,
  statusForMetric,
  type KpiReviewGroup,
  type KpiReviewMetricKey,
  type KpiReviewPlanLine,
} from "@/lib/kpi/kpiReview"

export type KpiBandTargetMetric = KpiReviewMetricKey | "cpm" | "cpc"

const LABEL_TO_METRIC: Record<string, KpiBandTargetMetric> = {
  CTR: "ctr",
  CVR: "conversion_rate",
  VTR: "vtr",
  "View rate": "vtr",
  "Completion rate": "vtr",
  CPM: "cpm",
  CPC: "cpc",
  CPV: "cpv",
}

function ratio(numerator: number, denominator: number): number | null {
  if (!(denominator > 0)) return null
  const n = numerator / denominator
  return Number.isFinite(n) ? n : null
}

function deliveredForBand(group: KpiReviewGroup, metric: KpiBandTargetMetric): number | null {
  if (metric === "ctr") return ratio(group.clicks, group.impressions)
  if (metric === "conversion_rate") return ratio(group.results, group.clicks)
  if (metric === "vtr") {
    if (!group.vtrTracked) return null
    return ratio(group.completes ?? 0, group.impressions)
  }
  if (metric === "cpm") {
    if (group.spend == null) return null
    const value = ratio(group.spend, group.impressions)
    return value == null ? null : value * 1000
  }
  if (metric === "cpc") {
    if (group.spend == null) return null
    return ratio(group.spend, group.clicks)
  }
  if (metric === "cpv") {
    if (group.spend == null || group.views == null || !(group.views > 0)) return null
    const value = group.spend / group.views
    return Number.isFinite(value) ? value : null
  }
  return null
}

function noTargetCaption(isAdmin: boolean): string {
  return isAdmin ? "No target saved" : "Target pending"
}

export function kpiReviewGroupForBand(input: {
  key: string
  label?: string
  items: readonly unknown[]
  plannedSpendByLineId: Record<string, number>
  impressions: number
  clicks: number
  results: number
  views: number | null
  spend: number | null
  spendModelled?: boolean
  vtrTracked?: boolean
}): KpiReviewGroup {
  const lineItemIds: string[] = []
  const planByLineId: Record<string, KpiReviewPlanLine> = {}
  const plannedSpendByLineId = { ...input.plannedSpendByLineId }
  for (const item of input.items) {
    const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    const id = String(rec.line_item_id ?? rec.lineItemId ?? rec.LINE_ITEM_ID ?? "").trim()
    if (!id) continue
    lineItemIds.push(id)
    const spend = Number(plannedSpendByLineId[id] ?? 0) || 0
    planByLineId[id] = extractKpiReviewPlanLine(item, spend)
    if (plannedSpendByLineId[id] == null) plannedSpendByLineId[id] = spend
  }
  return {
    key: input.key,
    label: input.label ?? input.key,
    colour: "",
    lineItemIds,
    plannedSpendByLineId,
    planByLineId,
    impressions: input.impressions,
    clicks: input.clicks,
    results: input.results,
    views: input.views,
    completes: input.vtrTracked ? input.views : null,
    spend: input.spend,
    spendModelled: input.spendModelled === true,
    vtrTracked: input.vtrTracked === true,
  }
}

export function applyKpiBandTargetsFromPlan(
  tiles: KpiTileProps[],
  input: Parameters<typeof kpiReviewGroupForBand>[0] & {
    lineItemTargets: Map<string, CampaignKPI> | undefined
    isAdmin: boolean
  },
): KpiTileProps[] {
  return applyKpiBandTargets(tiles, {
    group: kpiReviewGroupForBand(input),
    lineItemTargets: input.lineItemTargets ?? new Map(),
    isAdmin: input.isAdmin,
  })
}

export function applyKpiBandTargets(
  tiles: KpiTileProps[],
  input: {
    group: KpiReviewGroup
    lineItemTargets: Map<string, CampaignKPI>
    isAdmin: boolean
  },
): KpiTileProps[] {
  return tiles.map((tile) => overlayTile(tile, input))
}

function overlayTile(
  tile: KpiTileProps,
  input: {
    group: KpiReviewGroup
    lineItemTargets: Map<string, CampaignKPI>
    isAdmin: boolean
  },
): KpiTileProps {
  const metric = LABEL_TO_METRIC[tile.label]
  if (!metric) return tile
  const delivered = deliveredForBand(input.group, metric)

  if (metric === "cpm") {
    const plan = resolveCpmPlanRate(input.group)
    if (!plan) {
      return { ...tile, expected: undefined, status: undefined, progress: undefined, caption: noTargetCaption(input.isAdmin) }
    }
    return {
      ...tile,
      expected: formatMoney(plan.value),
      caption: plan.caption,
      status: statusForCostMetric(plan.value, delivered),
      progress: delivered != null && delivered > 0 ? Math.max(0, Math.min(1, plan.value / delivered)) : undefined,
    }
  }

  if (metric === "cpc") {
    const plan = resolveCpcPlanRate(input.group)
    if (plan.value == null) {
      return { ...tile, expected: undefined, status: undefined, progress: undefined, caption: plan.caption }
    }
    return {
      ...tile,
      expected: formatMoney(plan.value),
      caption: plan.caption,
      status: statusForCostMetric(plan.value, delivered),
      progress: delivered != null && delivered > 0 ? Math.max(0, Math.min(1, plan.value / delivered)) : undefined,
    }
  }

  if (metric === "cpv") {
    const plan = resolveCpvPlanRate(input.group, input.lineItemTargets)
    if (!plan) {
      return {
        ...tile,
        expected: undefined,
        status: undefined,
        progress: undefined,
        caption: "Not a view buy",
      }
    }
    return {
      ...tile,
      expected: formatTarget("cpv", plan.value),
      caption: plan.caption,
      status: statusForMetric("cpv", plan.value, delivered),
      progress: delivered != null && delivered > 0 ? Math.max(0, Math.min(1, plan.value / delivered)) : undefined,
    }
  }

  const target = resolveGroupTarget(input.group, metric, input.lineItemTargets)
  if (target == null) {
    return {
      ...tile,
      expected: undefined,
      status: undefined,
      progress: undefined,
      caption: noTargetCaption(input.isAdmin),
    }
  }
  return {
    ...tile,
    expected: formatTarget(metric, target.value),
    caption: target.source === "benchmark" ? "industry benchmark" : "plan target",
    status: statusForMetric(metric, target.value, delivered),
    progress:
      delivered != null && target.value > 0 ? Math.max(0, Math.min(1, delivered / target.value)) : undefined,
  }
}
