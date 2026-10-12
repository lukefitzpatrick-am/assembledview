import { lineExpectedNetToDate, type PacingBurstMoney } from "@/lib/pacing/detail/netBurstMediaForPacing"
import { deliveryStatusFromPct } from "@/lib/pacing/deliveryStatusFromPct"
import { dayBeforeISO } from "@/lib/reports/campaignReport/expectedMedia"

/** Client decks. 115% and above stays Ahead; the full band's Over-pacing label is not used here. */
export type ClientPaceBand = "On track" | "Behind" | "Ahead"

/** Why a report figure is null. The deck chooses the words. */
export type ReportGapReason = "not_available" | "no_plan"

export type ReportPace = {
  spendPacePct: number | null
  paceBand: ClientPaceBand | null
  paceReason: ReportGapReason | null
}

export function reportGapReason(
  value: number | null | undefined,
  kind: ReportGapReason,
): ReportGapReason | null {
  return value == null ? kind : null
}

export function reportPace(
  spend: number,
  expected: number | null,
  hasPlan: boolean,
): ReportPace {
  const expectedOk = typeof expected === "number" && Number.isFinite(expected) && expected !== 0
  if (!expectedOk || !Number.isFinite(spend)) {
    return {
      spendPacePct: null,
      paceBand: null,
      paceReason: hasPlan ? "not_available" : "no_plan",
    }
  }
  const ratio = spend / expected
  const status = deliveryStatusFromPct(ratio * 100)
  const paceBand: ClientPaceBand | null =
    status === "on-track" ? "On track" : status === "behind" ? "Behind" : status === "ahead" ? "Ahead" : null
  return {
    spendPacePct: ratio,
    paceBand,
    paceReason: paceBand == null ? (hasPlan ? "not_available" : "no_plan") : null,
  }
}

/** Sum of line net-burst expected already scoped to the snapshot window. Null when no line carries it. */
export function sumExpectedNetToDate(
  lines: ReadonlyArray<{ expectedNetToDate?: number | null }>,
): number | null {
  let sum = 0
  let any = false
  for (const line of lines) {
    const value = line.expectedNetToDate
    if (typeof value === "number" && Number.isFinite(value)) {
      any = true
      sum += value
    }
  }
  return any ? sum : null
}

/**
 * Net burst expected for one line. A window is the helper at the window end
 * minus the helper at the day before the window start. No window uses `asOf`.
 */
export function netBurstExpectedInWindow(args: {
  bursts: readonly PacingBurstMoney[]
  budgetIncludesFees: boolean
  feePct: number
  lineBudget: number
  lineStart: string | null
  lineEnd: string | null
  lineItemId: string
  windowStart?: string | null
  windowEnd?: string | null
  asOf: string
}): number {
  const at = (asOf: string) =>
    lineExpectedNetToDate({
      bursts: args.bursts,
      budgetIncludesFees: args.budgetIncludesFees,
      feePct: args.feePct,
      lineBudget: args.lineBudget,
      lineStart: args.lineStart,
      lineEnd: args.lineEnd,
      asOf,
      lineItemId: args.lineItemId,
    })
  if (args.windowStart && args.windowEnd) {
    const slice = at(args.windowEnd) - at(dayBeforeISO(args.windowStart))
    return slice > 0 ? slice : 0
  }
  return at(args.asOf)
}

export type ChannelPaceLine = {
  expectedNetToDate?: number | null
  startDate?: string | null
  spendToDate: number
  spendMode?: "estimated" | "actual" | "reported" | "assumed" | null
}

export type ChannelReportPace = ReportPace & {
  notLive: boolean
  plannedBudget: number
  plannedStart: string | null
  spendAssumed: boolean
  spendEstimated: boolean
  expectedSpendToDate: number | null
}

export function channelReportPace(input: {
  spend: number
  plannedBudget: number
  lines: readonly ChannelPaceLine[]
}): ChannelReportPace {
  const expected = sumExpectedNetToDate(input.lines)
  const pace = reportPace(input.spend, expected, input.plannedBudget > 0)
  let plannedStart: string | null = null
  for (const line of input.lines) {
    const start = line.startDate
    if (!start) continue
    if (plannedStart == null || start < plannedStart) plannedStart = start
  }
  const spendEstimated =
    input.lines.some((line) => line.spendMode === "estimated" && line.spendToDate > 0) &&
    !input.lines.some((line) => line.spendMode === "reported" && line.spendToDate > 0)
  return {
    ...pace,
    notLive: !(input.spend > 0),
    plannedBudget: input.plannedBudget,
    plannedStart,
    spendAssumed: input.lines.some((line) => line.spendMode === "assumed" && line.spendToDate > 0),
    spendEstimated,
    expectedSpendToDate: expected,
  }
}
