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

export function computePacing(_input: PacingMathsInput): PacingMathsOutput {
  throw new Error("not implemented")
}
