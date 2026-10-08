import {
  aggregateInvestmentDisplayRows,
  type InvestmentBurstInput,
  type InvestmentDisplayRow,
} from "@/lib/billing/prorateInvestmentDisplay"
import {
  channelSummaryTotals,
  type ChannelSummarySourceLine,
} from "@/lib/money/burst"

/**
 * Month rows for every container investment chart.
 * Each burst amount is lineTotals media plus fee (client-pays planned media
 * included, bonus and package inclusions zero, package not zeroed), then the
 * same day-weighted split the billing schedule uses. Display only.
 */
export function channelInvestmentByMonth(
  lines: readonly ChannelSummarySourceLine[],
  feePct: number,
): InvestmentDisplayRow[] {
  const money = channelSummaryTotals(lines, feePct)
  const bursts: InvestmentBurstInput[] = []
  for (const line of money.lines) {
    for (const burst of line.bursts) {
      if (burst.start === "" || burst.end === "") continue
      bursts.push({ amount: burst.amount, start: burst.start, end: burst.end })
    }
  }
  return aggregateInvestmentDisplayRows(bursts)
}
