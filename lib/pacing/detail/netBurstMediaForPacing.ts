import { computeToDateFromBurstAmounts } from "@/lib/delivery/search/searchCore"
import { netFromGross } from "@/lib/mediaplan/deliverableBudget"
import { lineTimePct } from "@/lib/pacing/channel/lineCardPace"
import { computeExpectedSpend } from "@/lib/pacing/maths"

export type PacingBurstMoney = {
  startDate: string
  endDate: string
  budget: number
  mediaAmount?: number | null
}

/**
 * Net media used to rate a burst.
 * A stored media amount wins. Otherwise a fee-inclusive budget is gross
 * and becomes net through `netFromGross`. Otherwise the budget is already net.
 */
export function netBurstMediaForPacing(
  burst: { mediaAmount?: number | null; budget: number },
  line: { budgetIncludesFees?: boolean },
  feePct: number,
): number {
  if (typeof burst.mediaAmount === "number" && Number.isFinite(burst.mediaAmount)) {
    return burst.mediaAmount
  }
  const budget = Number.isFinite(burst.budget) ? burst.budget : 0
  if (line.budgetIncludesFees) return netFromGross(budget, true, feePct)
  return budget
}

function lineNetBudget(budget: number, budgetIncludesFees: boolean, feePct: number): number {
  const amount = Number.isFinite(budget) ? budget : 0
  if (budgetIncludesFees) return netFromGross(amount, true, feePct)
  return amount
}

/**
 * Expected net media to date. Bursts are prorated on `netBurstMediaForPacing`.
 * No bursts: a straight line of the line's net budget across the line dates, logged.
 */
export function lineExpectedNetToDate(args: {
  bursts: readonly PacingBurstMoney[]
  budgetIncludesFees: boolean
  feePct: number
  lineBudget: number
  lineStart: string | null
  lineEnd: string | null
  asOf: string
  lineItemId: string
}): number {
  if (args.bursts.length === 0) {
    const net = lineNetBudget(args.lineBudget, args.budgetIncludesFees, args.feePct)
    console.warn(
      `[pacing-detail] no bursts for ${args.lineItemId}; straight-line net budget`,
    )
    if (!args.lineStart || !args.lineEnd) return 0
    const timePct = lineTimePct(args.lineStart, args.lineEnd, args.asOf)
    return computeExpectedSpend(net, timePct / 100)
  }

  return computeToDateFromBurstAmounts(
    args.bursts.map((burst) => ({
      startISO: burst.startDate,
      endISO: burst.endDate,
      amount: netBurstMediaForPacing(
        burst,
        { budgetIncludesFees: args.budgetIncludesFees },
        args.feePct,
      ),
    })),
    args.asOf,
  ).expectedToDate
}

/** Spend ÷ expected, as a percent. Zero expected with spend is 100, matching the old straight-line helper. */
export function spendPctOfExpected(spend: number, expected: number): number {
  if (!(expected > 0)) return spend > 0 ? 100 : 0
  return (spend / expected) * 100
}
