export type ScenarioRateKind = "cpc" | "cpm" | "cpv" | "cpa"

export type ScenarioRate = {
  kind: ScenarioRateKind
  value: number
  basis: "delivered" | "plan"
}

export type ScenarioBurst = {
  index: number
  start: string
  end: string
  budget: number
  spend: number
}

export type ScenarioDeliverable = {
  unit: string
  delivered: number
  planned: number
}

export type ScenarioLine = {
  lineItemId: string
  channel: string
  platform: string
  budget: number
  spent: number
  expectedToDate: number
  daysLeft: number
  daysElapsed: number
  endDate: string
  bursts: ScenarioBurst[]
  deliverable: ScenarioDeliverable | null
  rate: ScenarioRate | null
  yesterday: number
  dailyPlan: number
}

export type ScenarioMove = {
  from: string
  to: string
  amount: number
}

export type ScenarioCap = {
  lineItemId: string
  dailyCap: number
}

export type ScenarioBurstDateChange = {
  lineItemId: string
  index: number
  start: string
  end: string
}

export type ScenarioLevers = {
  moves: ScenarioMove[]
  caps: ScenarioCap[]
  pauses: string[]
  extendDays: number
  burstDateChanges: ScenarioBurstDateChange[]
}

export type ScenarioLineResult = {
  lineItemId: string
  remaining: number
  perDayNeeded: number
  projectedFinish: number
  finishPct: number
  paceAtFinish: "on-track" | "ahead" | "behind" | "no-data"
  projectedDeliverable: number | null
  burst: { spend: number; pct: number } | null
  notes: string[]
}

export type ScenarioCampaignResult = {
  projectedFinish: number
  budget: number
  delta: number
  deltaPct: number
}

export type ScenarioResult = {
  lines: ScenarioLineResult[]
  campaign: ScenarioCampaignResult
  warnings: string[]
}

export type KpiGoalMetric = "vtr" | "ctr" | "conversion_rate"

export type KpiGoalInput =
  | number
  | {
      value?: number
      kpi?: {
        metric: KpiGoalMetric
        target: number
        impressions?: number
        clicks?: number
      }
    }

export type KpiGoalResult = {
  needed: number
  perDay: number
  runRate: number
  impliedDailySpend: number
  daysToGoalAtRunRate: number
  verdict: "met" | "early" | "late"
  text: string
}

export type BackOnTrackFeasibility = "yes" | "stretch" | "unlikely"

export type BackOnTrackPlan = {
  gap: number
  dailyForPeriod: number
  thenPlanDaily: number
  multipleOfYesterday: number
  extraDeliverable: number | null
  feasibility: BackOnTrackFeasibility
  ceilingDays: number | null
  text: string
}
