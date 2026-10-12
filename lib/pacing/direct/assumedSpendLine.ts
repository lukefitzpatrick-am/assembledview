import { ASSUMED_SPEND_CAP_APPLIED } from "@/lib/spend/assumedSpend"

const FIXED_COST_CAPS = new Set(["fixed_cost", "fixed_cost_rounding"])

/** True when the daily fact rows are assumed spend, not the fixed-cost path. */
export function lineIsAssumedSpend(line: {
  daily: readonly { capApplied: string }[]
}): boolean {
  if (line.daily.length === 0) return false
  let assumed = false
  for (const day of line.daily) {
    const cap = day.capApplied.trim().toLowerCase()
    if (FIXED_COST_CAPS.has(cap)) return false
    if (cap === ASSUMED_SPEND_CAP_APPLIED) assumed = true
  }
  return assumed
}
