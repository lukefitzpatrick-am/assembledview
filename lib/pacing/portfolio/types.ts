import type { AssumedExpectedLine } from "@/lib/spend/assumedSpend"

export type PortfolioPace =
  | "behind"
  | "on_track"
  | "ahead"
  | "no_delivery"
  | "no_source"
  | "not_started"

export type ChannelSpendMode = "actual" | "reported" | "modelled" | "estimated" | "assumed"

export type ChannelSourceState = "reporting" | "connecting" | "not_started" | "no_source"

export type ChannelPacingRow = {
  channelKey: string
  label: string
  spendToDate: number
  budget: number
  expectedToDate: number
  spendPct: number
  pace: PortfolioPace
  spendMode: ChannelSpendMode
  deliverable: { unit: string; delivered: number; planned: number } | null
  sourceState: ChannelSourceState
  lineItemIds: string[]
}

export type CampaignPacingRow = {
  mbaNumber: string
  versionNumber: number
  clientName: string
  clientSlug: string
  campaignName: string
  status: string
  startDate: string
  endDate: string
  daysElapsed: number
  daysTotal: number
  daysLeft: number
  timePct: number
  budget: number
  spendToDate: number
  expectedToDate: number
  spendPct: number
  pace: PortfolioPace
  projectedFinish: number | null
  spendYesterday: number
  dailyRateActual: number
  dailyRatePlan: number
  kpi: { tracked: number; total: number } | null
  moneyAtRisk: number
  why: string
  channels: ChannelPacingRow[]
  /**
   * Last day counted (P1). Set on rows built since admin pacing counts to
   * Melbourne yesterday. A stored row without it was counted to its as-of day.
   */
  countToDate?: string
}

export type PortfolioPacingCounts = {
  live: number
  behind: number
  on_track: number
  ahead: number
  over_pacing: number
  attention: number
}

export type CampaignScheduleInput = {
  billingSchedule?: unknown
  deliverySchedule?: unknown
  monthlySpend?: unknown
  campaignBudget?: number
  /** Plan lines paced as assumed spend. Expected and, when Snowflake has no rows, delivered follow their bursts. */
  assumedLines?: AssumedExpectedLine[]
  /**
   * Step-3 fallback for `resolveCampaignExpectedSpendToDate`, the same figure
   * the campaign page passes as `metrics.expectedSpendToDate`. Not stored on
   * the portfolio snapshot row.
   */
  metricsExpectedSpendToDate?: number
}
