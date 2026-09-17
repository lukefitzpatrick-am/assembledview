import type { LineCardModel, LineCardPace } from "@/lib/pacing/channel/lineCardTypes"
import { inclusiveDaysBetween } from "@/lib/pacing/burst/currentBurst"
import { spendVsExpectedPct, lineTimePct, resolveLinePace } from "@/lib/pacing/channel/lineCardPace"
import type { CampaignDetailBurst } from "./types"

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

/** Current-burst rows for the Bursts tab. Timeline uses each line's burst strip. */
export function burstsFromLines(lines: readonly LineCardModel[], asOf: string): CampaignDetailBurst[] {
  const rows: CampaignDetailBurst[] = []
  for (const line of lines) {
    if (line.burstStart == null || line.burstEnd == null) continue
    if (line.burstBudget == null) continue
    const spend = line.burstSpend ?? 0
    const timePct = lineTimePct(line.burstStart, line.burstEnd, asOf)
    const pct = spendVsExpectedPct(spend, line.burstBudget, timePct)
    rows.push({
      lineItemId: line.lineItemId,
      index: line.bursts.index ?? 0,
      start: line.burstStart,
      end: line.burstEnd,
      days: inclusiveDaysBetween(line.burstStart, line.burstEnd) ?? line.burstDays ?? 0,
      budget: line.burstBudget,
      spend,
      pct,
      status: burstStatus({
        asOf,
        start: line.burstStart,
        end: line.burstEnd,
        spend,
        budget: line.burstBudget,
      }),
    })
  }
  return rows
}
