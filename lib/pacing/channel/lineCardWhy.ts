import type { LineCardModel, LineCardPace } from "./lineCardTypes"
import { burstMonthLabel } from "./lineCardPace"

function moneyLabel(n: number): string {
  return `$${Math.round(n).toLocaleString("en-AU")}`
}

function dailyMultiple(actual: number, plan: number): string {
  if (!(plan > 0)) return "0.0"
  return (actual / plan).toFixed(1)
}

export function burstWhyClause(input: {
  burstStart: string | null | undefined
  burstPct: number | null
  daysLeft: number | null
}): string | null {
  if (input.burstPct == null || input.daysLeft == null) return null
  const month = burstMonthLabel(input.burstStart)
  if (!month) return null
  return `${month} burst is ${Math.round(input.burstPct)}% of expected with ${input.daysLeft} days left.`
}

export function lineWhySentence(input: {
  pace: LineCardPace
  platform: string
  linePct: number
  daysElapsed: number
  daysLeft: number
  spend: number
  budget: number
  projectedFinish: number | null
  perDayLeft: number | null
  perDayPlan: number | null
  sourceState: LineCardModel["sourceState"]
  burstClause: string | null
}): string {
  const clauses: string[] = []
  if (input.burstClause) clauses.push(input.burstClause)

  if (input.pace === "over_pacing") {
    const actual = input.perDayLeft != null && input.daysLeft > 0
      ? (input.budget - Math.max(0, input.budget - input.spend)) / Math.max(input.daysElapsed, 1)
      : input.spend / Math.max(input.daysElapsed, 1)
    const plan = input.perDayPlan ?? 0
    const finish = input.projectedFinish ?? 0
    clauses.push(
      `${input.platform || "This line"} is spending at ${dailyMultiple(actual, plan)}× the daily plan; projected finish ${moneyLabel(finish)} against ${moneyLabel(input.budget)}.`,
    )
    return clauses.join(" ")
  }

  if (input.sourceState === "no_source") {
    clauses.push(
      `${input.platform || "This line"} has no source connected, so the campaign cannot read on track.`,
    )
    return clauses.join(" ")
  }

  if (input.pace === "no_data") {
    clauses.push(
      `${input.daysElapsed} days in flight and no rows from ${input.platform || "the plan"}.`,
    )
    return clauses.join(" ")
  }

  if (input.pace === "behind") {
    clauses.push(`${input.platform || "This line"} is ${Math.round(input.linePct)}% of expected.`)
    return clauses.join(" ")
  }

  clauses.push(
    `Delivery is ${Math.round(input.linePct)}% of expected with ${input.daysLeft} days left.`,
  )
  return clauses.join(" ")
}
