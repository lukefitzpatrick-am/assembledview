// Status strings from V_LINE_ITEM_PACING; order in computeStatus matches SQL CASE order.
export type PacingStatus =
  | "not_started"
  | "completed"
  | "no_delivery"
  | "on_track"
  | "slightly_under"
  | "under_pacing"
  | "slightly_over"
  | "over_pacing"
  | "unknown"

export type PacingMathsInput = {
  lineItemBudget: number
  startDate: string
  endDate: string
  spendToDate: number
  spendYesterday: number
  impressionsToDate: number
  clicksToDate: number
  conversionsToDate: number
  revenueToDate: number
  asOfDate?: string
}

export type PacingMathsOutput = {
  asOfDate: string
  campaignDays: number
  daysPassed: number
  daysRemaining: number
  expectedPct: number
  expectedSpend: number
  spendVariance: number
  spendVariancePct: number
  dailyPace: number
  requiredDaily: number
  projectedTotal: number
  projectionVariancePct: number
  ctr: number
  cpc: number
  cpa: number
  cr: number
  roas: number
  status: PacingStatus
}

export function computePacing(_input: PacingMathsInput): PacingMathsOutput {
  throw new Error("not implemented")
}
