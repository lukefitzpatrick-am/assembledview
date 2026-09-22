import type { RowKpiStatus, SingleKpiStatus } from "@/lib/pacing/kpi/computeKpiStatus"
import type { ChannelSourceState, ChannelSpendMode } from "@/lib/pacing/portfolio/types"

export type ChannelTabKey = "search" | "social" | "programmatic" | "ad-serving" | "direct"

export type LineCardPace = "behind" | "on_track" | "ahead" | "over_pacing" | "no_data"

export type LineCardKpiSource = "target" | "benchmark" | "rate" | null

export type LineCardMetric = {
  label: string
  value: string
}

export type LineCardKpi = {
  label: string
  delivered: string
  target: string
  source: LineCardKpiSource
  status: SingleKpiStatus | null
}

export type LineCardBurstState = "done" | "now" | "future"

export type LineCardBursts = {
  index: number | null
  total: number
  states: LineCardBurstState[]
}

export type LineCardPlanBurst = {
  index: number
  start: string
  end: string
  budget: number
  calculatedValue: number
  reportedSpend?: number
}

export type LineCardModel = {
  client: string
  campaignName: string
  mba: string
  clientSlug: string
  lineItemId: string
  platform: string
  pace: LineCardPace
  kpiStatus: RowKpiStatus | null
  timePct: number
  linePct: number
  burstPct: number | null
  spend: number
  budget: number
  burstSpend: number | null
  burstBudget: number | null
  remainingLine: number
  perDayLeft: number | null
  perDayPlan: number | null
  yesterday: number
  metrics: LineCardMetric[]
  kpis: LineCardKpi[]
  bursts: LineCardBursts
  why: string
  lineStart: string | null
  lineEnd: string | null
  targeting: string
  spendMode: ChannelSpendMode | null
  sourceState: ChannelSourceState
  burstMonth: string | null
  verificationOnly: boolean
  channel: ChannelTabKey
  buyType: string | null
  fixedCost: boolean
  impressions: number | null
  clicks: number | null
  ctr: number | null
  cpc: number | null
  cpm: number | null
  conversions: number | null
  views: number | null
  remainingBurst: number | null
  burstStart: string | null
  burstEnd: string | null
  burstDays: number | null
  planBursts: LineCardPlanBurst[]
}
