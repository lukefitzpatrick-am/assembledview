import type { LineCardModel, LineCardPace, LineCardPlanBurst } from "@/lib/pacing/channel/lineCardTypes"
import { inclusiveDaysBetween } from "@/lib/pacing/burst/currentBurst"
import {
  burstMonthLabel,
  lineTimePct,
  perDayLeftForWindow,
  resolveLinePace,
  spendVsExpectedPct,
} from "@/lib/pacing/channel/lineCardPace"
import { computeExpectedSpend } from "@/lib/pacing/maths"
import { normalizeDailyFactDate } from "@/lib/snowflake/normalizeDate"
import type { DailyFactPoint } from "./dailyFromFacts"
import type { CampaignDetailBurst } from "./types"

export const NO_BURSTS_BOOKED = "no bursts booked"

function burstStatus(args: {
  asOf: string
  start: string
  end: string
  spend: number
  budget: number
}): LineCardPace {
  const timePct = lineTimePct(args.start, args.end, args.asOf)
  const pct = spendVsExpectedPct(args.spend, args.budget, timePct)
  return resolveLinePace({
    timePct,
    linePct: pct,
    spend: args.spend,
    budget: args.budget,
    start: args.start,
    asOf: args.asOf,
    hasFactRows: args.spend > 0,
  })
}

function planWindows(line: LineCardModel): LineCardPlanBurst[] {
  if (line.planBursts.length > 0) return line.planBursts
  if (line.burstStart && line.burstEnd && line.burstBudget != null) {
    return [
      {
        index: Math.max(0, (line.bursts.index ?? 1) - 1),
        start: line.burstStart,
        end: line.burstEnd,
        budget: line.burstBudget,
        calculatedValue: 0,
      },
    ]
  }
  return []
}

function burstName(plan: LineCardPlanBurst): string {
  return burstMonthLabel(plan.start) ?? `Burst ${plan.index + 1}`
}

function deliveredForBuyType(
  buyType: string | null,
  windowed: { impressions: number; clicks: number; views: number },
): number {
  const kind = (buyType ?? "").trim().toLowerCase()
  if (kind === "cpc") return windowed.clicks
  if (kind === "cpv") return windowed.views
  return windowed.impressions
}

function windowedFacts(
  facts: readonly DailyFactPoint[],
  lineItemId: string,
  start: string,
  end: string,
): { spend: number; impressions: number; clicks: number; views: number; hasSpend: boolean } {
  const id = lineItemId.trim().toLowerCase()
  let spend = 0
  let impressions = 0
  let clicks = 0
  let views = 0
  let hasSpend = false
  for (const fact of facts) {
    const date = normalizeDailyFactDate(fact.date)
    if (!date || date < start || date > end) continue
    const factId = (fact.lineItemId ?? "").trim().toLowerCase()
    if (factId !== id) continue
    spend += fact.spend
    impressions += fact.impressions
    clicks += fact.clicks
    views += fact.views
    if (fact.spend > 0) hasSpend = true
  }
  return { spend, impressions, clicks, views, hasSpend }
}

function emptyLane(line: LineCardModel): CampaignDetailBurst {
  return {
    lineItemId: line.lineItemId,
    index: 0,
    name: NO_BURSTS_BOOKED,
    start: line.lineStart ?? "",
    end: line.lineEnd ?? "",
    days: 0,
    budget: 0,
    spend: 0,
    expected: 0,
    pct: 0,
    status: "no_data",
    impressions: 0,
    clicks: 0,
    views: 0,
    plannedDeliverable: 0,
    deliveredDeliverable: 0,
    perDayLeft: null,
    empty: true,
  }
}

function segmentFromPlan(
  line: LineCardModel,
  plan: LineCardPlanBurst,
  asOf: string,
  facts: readonly DailyFactPoint[],
): CampaignDetailBurst {
  const windowed = windowedFacts(facts, line.lineItemId, plan.start, plan.end)
  const reported = line.fixedCost || line.spendMode === "reported"
  const spend =
    reported && !windowed.hasSpend && plan.reportedSpend != null ? plan.reportedSpend : windowed.spend
  const timePct = lineTimePct(plan.start, plan.end, asOf)
  const expected = computeExpectedSpend(plan.budget, timePct / 100)
  const pct = spendVsExpectedPct(spend, plan.budget, timePct)
  const remaining = plan.budget - spend
  return {
    lineItemId: line.lineItemId,
    index: plan.index,
    name: burstName(plan),
    start: plan.start,
    end: plan.end,
    days: inclusiveDaysBetween(plan.start, plan.end) ?? 0,
    budget: plan.budget,
    spend,
    expected,
    pct,
    status: burstStatus({
      asOf,
      start: plan.start,
      end: plan.end,
      spend,
      budget: plan.budget,
    }),
    impressions: windowed.impressions,
    clicks: windowed.clicks,
    views: windowed.views,
    plannedDeliverable: plan.calculatedValue,
    deliveredDeliverable: deliveredForBuyType(line.buyType, windowed),
    perDayLeft: perDayLeftForWindow(remaining, plan.start, plan.end, asOf),
  }
}

/** One row per real plan burst, windowed from the same daily facts the cards use. */
export function burstsFromLines(
  lines: readonly LineCardModel[],
  asOf: string,
  facts: readonly DailyFactPoint[] = [],
): CampaignDetailBurst[] {
  const rows: CampaignDetailBurst[] = []
  for (const line of lines) {
    const plans = planWindows(line)
    if (plans.length === 0) {
      rows.push(emptyLane(line))
      continue
    }
    for (const plan of plans) {
      rows.push(segmentFromPlan(line, plan, asOf, facts))
    }
  }
  return rows
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && aEnd >= bStart
}

/** Burst rows whose dates overlap the window, clicked line first. */
export function overlappingBurstRows(
  bursts: readonly CampaignDetailBurst[],
  window: { start: string; end: string },
  clickedLineItemId: string,
): CampaignDetailBurst[] {
  const clicked = clickedLineItemId.trim().toLowerCase()
  const matched = bursts.filter(
    (burst) =>
      !burst.empty &&
      burst.start &&
      burst.end &&
      rangesOverlap(burst.start, burst.end, window.start, window.end),
  )
  const head = matched.filter((burst) => burst.lineItemId.trim().toLowerCase() === clicked)
  const rest = matched
    .filter((burst) => burst.lineItemId.trim().toLowerCase() !== clicked)
    .toSorted(
      (a, b) => a.lineItemId.localeCompare(b.lineItemId) || a.start.localeCompare(b.start),
    )
  return [...head, ...rest]
}

export function burstAxisRange(
  bursts: readonly CampaignDetailBurst[],
  asOf: string,
  campaignStart?: string | null,
  campaignEnd?: string | null,
): { start: string; end: string } {
  const year = asOf.slice(0, 4)
  let start = `${year}-01-01`
  let end = `${year}-12-31`
  if (campaignStart && campaignStart < start) start = campaignStart
  if (campaignEnd && campaignEnd > end) end = campaignEnd
  for (const burst of bursts) {
    if (burst.empty || !burst.start || !burst.end) continue
    if (burst.start < start) start = burst.start
    if (burst.end > end) end = burst.end
  }
  return { start, end }
}

export function pctAlong(date: string, start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`)
  const to = Date.parse(`${end}T00:00:00Z`)
  const at = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(at) || to <= from) return 0
  return Math.max(0, Math.min(100, ((at - from) / (to - from)) * 100))
}

export function burstFillPct(spend: number, budget: number): number {
  if (!(budget > 0) || !Number.isFinite(spend)) return 0
  return Math.max(0, Math.min(100, (spend / budget) * 100))
}
