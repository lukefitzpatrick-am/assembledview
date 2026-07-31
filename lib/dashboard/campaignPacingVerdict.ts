import { computePacing } from "@/lib/pacing/maths"
import { pacingStatus, type ResolvedPacingStatus } from "@/lib/pacing/status"

export type CampaignPacingVerdictInput = {
  budget: number
  startDate: string
  endDate: string
  /** Snowflake delivered spend; omit / 0 when no delivery reported. */
  spendToDate: number
  asOfDate?: string
}

/**
 * Campaign-level plain-language pacing verdict.
 * Uses the same `computePacing` → `pacingStatus()` path as /pacing — no second threshold set.
 */
export function campaignPacingVerdict(
  input: CampaignPacingVerdictInput,
): ResolvedPacingStatus | null {
  const budget = Number(input.budget)
  const startDate = input.startDate?.trim()
  const endDate = input.endDate?.trim()
  if (!Number.isFinite(budget) || budget <= 0 || !startDate || !endDate) return null

  const maths = computePacing({
    lineItemBudget: budget,
    startDate,
    endDate,
    spendToDate: Number.isFinite(input.spendToDate) ? Math.max(0, input.spendToDate) : 0,
    spendYesterday: 0,
    impressionsToDate: 0,
    clicksToDate: 0,
    conversionsToDate: 0,
    revenueToDate: 0,
    asOfDate: input.asOfDate,
  })

  return pacingStatus(maths.status)
}

/** Sentence for the campaign summary strip. */
export function campaignPacingVerdictSentence(resolved: ResolvedPacingStatus): string {
  switch (resolved.status) {
    case "on-track":
      return "Pacing verdict: on track versus the plan."
    case "ahead":
      return "Pacing verdict: ahead of the plan."
    case "behind":
      return "Pacing verdict: behind the plan."
    case "over-pacing":
      return "Pacing verdict: over-pacing versus the plan."
    case "no-data":
      return "Pacing verdict: not enough data yet."
    default:
      return `Pacing verdict: ${resolved.label.toLowerCase()}.`
  }
}
