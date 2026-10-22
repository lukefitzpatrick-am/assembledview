/**
 * Plan CPV for pacing KPI cells (C2, 22 Oct 2026).
 *
 * CPV is a plan rate (INVARIANTS KPI law). Saved `campaign_kpi.cpv` values
 * are leftovers and are ignored. The rate is the one the MBA KPI review
 * shows (`resolveCpvPlanRate` in `lib/kpi/kpiReview.ts`): the plan's buy
 * rate on CPV buys, else planned spend over planned views, else planned
 * spend over impressions times the saved VTR target. Null when none applies.
 */
import {
  extractKpiReviewPlanLine,
  resolveCpvPlanRate,
  type KpiReviewGroup,
  type KpiReviewPlanLine,
} from "@/lib/kpi/kpiReview"
import type { CampaignKPI } from "@/lib/kpi/types"

/** Plan fields the CPV rate reads, from the raw media plan line. */
export function kpiPlanLineFromPlanItem(item: unknown, plannedSpend: number): KpiReviewPlanLine {
  return extractKpiReviewPlanLine(item, plannedSpend)
}

/** One line's plan CPV, as the KPI review computes it. */
export function planCpvRateForLine(args: {
  lineItemId: string
  planLine: KpiReviewPlanLine | null | undefined
  /** The line's saved KPI row. Only its VTR target is read (VTR-derived rate). */
  kpiRow?: CampaignKPI | null
}): number | null {
  if (!args.planLine) return null
  const id = args.lineItemId
  const group: KpiReviewGroup = {
    key: id,
    label: id,
    colour: "",
    lineItemIds: [id],
    plannedSpendByLineId: { [id]: args.planLine.plannedSpend },
    planByLineId: { [id]: args.planLine },
    impressions: 0,
    clicks: 0,
    results: 0,
    views: null,
    completes: null,
    spend: null,
    spendModelled: false,
    vtrTracked: false,
  }
  const targets = new Map<string, CampaignKPI>()
  if (args.kpiRow) targets.set(id, { ...args.kpiRow, line_item_id: args.kpiRow.line_item_id ?? id })
  const plan = resolveCpvPlanRate(group, targets)
  return plan && Number.isFinite(plan.value) && plan.value > 0 ? plan.value : null
}
