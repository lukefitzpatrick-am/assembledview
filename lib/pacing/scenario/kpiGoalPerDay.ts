import { fmtInt } from "./format.js"
import { deliverableToSpend } from "./rate.js"
import type { KpiGoalInput, KpiGoalResult, ScenarioLine } from "./types.js"

function resolveGoal(line: ScenarioLine, goal?: KpiGoalInput): number | null {
  if (typeof goal === "number") return goal
  if (goal && typeof goal === "object" && goal.value != null) return goal.value
  const kpi = goal && typeof goal === "object" ? goal.kpi : undefined
  if (kpi && Number.isFinite(kpi.target)) {
    if (kpi.metric === "vtr" || kpi.metric === "ctr") {
      const impressions =
        kpi.impressions ??
        (line.deliverable?.unit === "impressions" ? line.deliverable.planned : null)
      if (impressions != null) return impressions * kpi.target
    }
    if (kpi.metric === "conversion_rate") {
      const clicks =
        kpi.clicks ?? (line.deliverable?.unit === "clicks" ? line.deliverable.planned : null)
      if (clicks != null) return clicks * kpi.target
    }
  }
  return line.deliverable?.planned ?? null
}

function deliveredForGoal(line: ScenarioLine, goal?: KpiGoalInput): number {
  const kpi = typeof goal === "object" && goal ? goal.kpi : undefined
  if (kpi && (kpi.metric === "vtr" || kpi.metric === "ctr" || kpi.metric === "conversion_rate")) {
    if (line.deliverable?.unit === "impressions" && kpi.metric === "vtr") return 0
    if (line.deliverable?.unit === "impressions" && kpi.metric === "ctr") return 0
    if (line.deliverable?.unit === "clicks" && kpi.metric === "conversion_rate") return 0
  }
  return line.deliverable?.delivered ?? 0
}

export function kpiGoalPerDay(line: ScenarioLine, goal?: KpiGoalInput): KpiGoalResult {
  const resolved = resolveGoal(line, goal)
  const delivered = deliveredForGoal(line, goal)
  const needed = resolved == null ? Number.NaN : Math.max(0, resolved - delivered)
  const perDay = line.daysLeft > 0 && Number.isFinite(needed) ? needed / line.daysLeft : Number.NaN
  const runRate = line.daysElapsed > 0 ? delivered / line.daysElapsed : Number.NaN
  const impliedDailySpend = deliverableToSpend(perDay, line.rate)
  const daysToGoalAtRunRate =
    needed === 0
      ? 0
      : Number.isFinite(runRate) && runRate > 0 && Number.isFinite(needed)
        ? Math.ceil(needed / runRate)
        : Number.POSITIVE_INFINITY

  let verdict: KpiGoalResult["verdict"] = "late"
  if (!Number.isFinite(needed) || needed === 0) verdict = "met"
  else if (Number.isFinite(daysToGoalAtRunRate) && daysToGoalAtRunRate <= line.daysLeft) {
    verdict = "early"
  }

  const unit = line.deliverable?.unit ?? "units"
  const daysEarly = line.daysLeft - daysToGoalAtRunRate
  const text =
    verdict === "met"
      ? `The ${fmtInt(resolved ?? 0)} ${unit} goal is already met.`
      : verdict === "early"
        ? `${fmtInt(perDay)} ${unit} a day lands the ${fmtInt(resolved ?? 0)} goal ${fmtInt(daysEarly)} days early.`
        : `${fmtInt(perDay)} ${unit} a day is needed; the current ${fmtInt(runRate)} a day lands late.`

  return {
    needed,
    perDay,
    runRate,
    impliedDailySpend,
    daysToGoalAtRunRate,
    verdict,
    text,
  }
}
