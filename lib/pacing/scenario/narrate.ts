import { fmtInt, fmtMoney } from "./format.js"
import type { BackOnTrackPlan, KpiGoalResult, ScenarioResult } from "./types.js"

function isScenarioResult(input: ScenarioResult | KpiGoalResult | BackOnTrackPlan): input is ScenarioResult {
  return "campaign" in input && "warnings" in input && "lines" in input
}

function isGoalResult(input: ScenarioResult | KpiGoalResult | BackOnTrackPlan): input is KpiGoalResult {
  return "verdict" in input && "perDay" in input && "runRate" in input
}

export function narrate(input: ScenarioResult | KpiGoalResult | BackOnTrackPlan): string {
  if (isScenarioResult(input)) {
    const moveNote = input.lines.flatMap((line) => line.notes).find((note) => /Moved/.test(note))
    const capNote = input.lines.flatMap((line) => line.notes).find((note) => /Daily cap/.test(note))
    const burst = input.lines.find((line) => line.burst)?.burst
    const lead = input.campaign.delta <= 0
      ? `${moveNote ? `${moveNote.replace(/\.$/, "")}${capNote ? ` and ${capNote.toLowerCase().replace(/\.$/, "")}` : ""}` : "The levers"} bring the campaign in on budget.`
      : `The levers leave the campaign ${fmtMoney(Math.abs(input.campaign.delta))} over the ${fmtMoney(input.campaign.budget)} budget.`
    const burstText = burst
      ? ` The current burst lands at ${fmtInt(burst.pct)}% (${fmtMoney(burst.spend)}).`
      : ""
    return `${lead} Projected finish ${fmtMoney(input.campaign.projectedFinish)} against ${fmtMoney(input.campaign.budget)}.${burstText}`
  }

  if (isGoalResult(input)) {
    return input.text
  }

  return input.text
}
