import { div0 } from "./div0"

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

function parseYmdUtc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((x) => Number(x))
  return Date.UTC(y, m - 1, d)
}

/** Calendar-day difference matching Snowflake DATEDIFF('day', start, end). */
function diffCalendarDays(startYmd: string, endYmd: string): number {
  return Math.round((parseYmdUtc(endYmd) - parseYmdUtc(startYmd)) / 86_400_000)
}

export function computeCampaignDays(startYmd: string, endYmd: string): number {
  return diffCalendarDays(startYmd, endYmd) + 1
}

export function computeDaysPassed(startYmd: string, endYmd: string, asOfYmd: string): number {
  const campaignDays = computeCampaignDays(startYmd, endYmd)
  const raw = diffCalendarDays(startYmd, asOfYmd) + 1
  return Math.max(0, Math.min(campaignDays, raw))
}

export function computeDaysRemaining(startYmd: string, endYmd: string, asOfYmd: string): number {
  const campaignDays = computeCampaignDays(startYmd, endYmd)
  const daysPassed = computeDaysPassed(startYmd, endYmd, asOfYmd)
  return Math.max(0, campaignDays - daysPassed)
}

/** Melbourne calendar date (YYYY-MM-DD) for "today", matching the view's as_of_date. */
export function getAsOfDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

export function computeExpectedPct(daysPassed: number, campaignDays: number): number {
  return div0(daysPassed, campaignDays)
}

export function computeExpectedSpend(budget: number, expectedPct: number): number {
  return budget * expectedPct
}

export function computeSpendVariance(spendToDate: number, expectedSpend: number): number {
  return spendToDate - expectedSpend
}

export function computeSpendVariancePct(variance: number, expectedSpend: number): number {
  return div0(variance, expectedSpend)
}

export function computeDailyPace(spendToDate: number, daysPassed: number): number {
  return div0(spendToDate, daysPassed)
}

export function computeRequiredDaily(
  budget: number,
  spendToDate: number,
  daysRemaining: number,
): number {
  return div0(budget - spendToDate, daysRemaining)
}

export function computeProjectedTotal(dailyPace: number, campaignDays: number): number {
  return dailyPace * campaignDays
}

export function computeProjectionVariancePct(projectedTotal: number, budget: number): number {
  return div0(projectedTotal - budget, budget)
}

export function computeStatus(input: {
  asOfDate: string
  startDate: string
  endDate: string
  spendToDate: number
  daysPassed: number
  projectionVariancePct: number
}): PacingStatus {
  const { asOfDate, startDate, endDate, spendToDate, daysPassed, projectionVariancePct } = input

  // Order from V_LINE_ITEM_PACING — DO NOT REORDER
  if (asOfDate < startDate) return "not_started"
  if (asOfDate > endDate) return "completed"
  if (spendToDate === 0 && daysPassed >= 2) return "no_delivery"
  if (Math.abs(projectionVariancePct) <= 0.05) return "on_track"
  if (projectionVariancePct > -0.15 && projectionVariancePct < -0.05) return "slightly_under"
  if (projectionVariancePct <= -0.15) return "under_pacing"
  if (projectionVariancePct > 0.05 && projectionVariancePct < 0.15) return "slightly_over"
  if (projectionVariancePct >= 0.15) return "over_pacing"

  return "unknown"
}

function computeKpis(input: {
  spendToDate: number
  impressionsToDate: number
  clicksToDate: number
  conversionsToDate: number
  revenueToDate: number
}): { ctr: number; cpc: number; cpa: number; cr: number; roas: number } {
  return {
    ctr: div0(input.clicksToDate, input.impressionsToDate),
    cpc: div0(input.spendToDate, input.clicksToDate),
    cpa: div0(input.spendToDate, input.conversionsToDate),
    cr: div0(input.conversionsToDate, input.clicksToDate),
    roas: div0(input.revenueToDate, input.spendToDate),
  }
}

export function computePacing(input: PacingMathsInput): PacingMathsOutput {
  const asOfDate = input.asOfDate ?? getAsOfDate()

  const campaignDays = computeCampaignDays(input.startDate, input.endDate)
  const daysPassed = computeDaysPassed(input.startDate, input.endDate, asOfDate)
  const daysRemaining = computeDaysRemaining(input.startDate, input.endDate, asOfDate)

  const expectedPct = computeExpectedPct(daysPassed, campaignDays)
  const expectedSpend = computeExpectedSpend(input.lineItemBudget, expectedPct)
  const spendVariance = computeSpendVariance(input.spendToDate, expectedSpend)
  const spendVariancePct = computeSpendVariancePct(spendVariance, expectedSpend)
  const dailyPace = computeDailyPace(input.spendToDate, daysPassed)
  const requiredDaily = computeRequiredDaily(input.lineItemBudget, input.spendToDate, daysRemaining)
  const projectedTotal = computeProjectedTotal(dailyPace, campaignDays)
  const projectionVariancePct = computeProjectionVariancePct(projectedTotal, input.lineItemBudget)

  const kpis = computeKpis({
    spendToDate: input.spendToDate,
    impressionsToDate: input.impressionsToDate,
    clicksToDate: input.clicksToDate,
    conversionsToDate: input.conversionsToDate,
    revenueToDate: input.revenueToDate,
  })

  const status = computeStatus({
    asOfDate,
    startDate: input.startDate,
    endDate: input.endDate,
    spendToDate: input.spendToDate,
    daysPassed,
    projectionVariancePct,
  })

  return {
    asOfDate,
    campaignDays,
    daysPassed,
    daysRemaining,
    expectedPct,
    expectedSpend,
    spendVariance,
    spendVariancePct,
    dailyPace,
    requiredDaily,
    projectedTotal,
    projectionVariancePct,
    ...kpis,
    status,
  }
}
