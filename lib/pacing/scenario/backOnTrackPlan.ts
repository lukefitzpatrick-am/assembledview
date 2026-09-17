import { fmtInt, fmtMoney, fmtMultiple } from "./format.js"
import { remainingSpendToDeliverable } from "./rate.js"
import type { BackOnTrackFeasibility, BackOnTrackPlan, ScenarioLine } from "./types.js"

function feasibilityFromMultiple(multiple: number): BackOnTrackFeasibility {
  if (!Number.isFinite(multiple)) return "unlikely"
  if (multiple <= 2) return "yes"
  if (multiple <= 4) return "stretch"
  return "unlikely"
}

export function backOnTrackPlan(line: ScenarioLine, withinDays: number): BackOnTrackPlan {
  const gap = line.expectedToDate - line.spent
  const days = withinDays > 0 ? withinDays : line.daysLeft
  const dailyForPeriod = line.dailyPlan + (days > 0 ? gap / days : Number.NaN)
  const thenPlanDaily = line.dailyPlan
  const multipleOfYesterday = line.yesterday > 0 ? dailyForPeriod / line.yesterday : Number.POSITIVE_INFINITY
  const extraDeliverable = remainingSpendToDeliverable(gap, line.rate)
  const ceilingDays =
    line.yesterday > 0 && gap > 0 ? Math.ceil(gap / (2 * line.yesterday)) : null
  const feasibility = feasibilityFromMultiple(multipleOfYesterday)

  const text =
    `Closing a ${fmtMoney(gap)} gap in ${fmtInt(days)} days means ${fmtMoney(dailyForPeriod)} a day, ` +
    `${fmtMultiple(multipleOfYesterday)} yesterday. ` +
    (feasibility === "yes"
      ? "Feasible."
      : feasibility === "stretch"
        ? "A stretch."
        : "Unlikely.")

  return {
    gap,
    dailyForPeriod,
    thenPlanDaily,
    multipleOfYesterday,
    extraDeliverable,
    feasibility,
    ceilingDays,
    text,
  }
}
