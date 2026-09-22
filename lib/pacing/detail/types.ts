import type { CampaignRead } from "@/lib/campaign-read/types"
import type { LineCardModel, LineCardPace } from "@/lib/pacing/channel/lineCardTypes"
import type { CampaignDetailKpiCard } from "@/lib/pacing/detail/kpisFromLines"
import type { CampaignPacingRow } from "@/lib/pacing/portfolio/types"
import type { ScenarioLine } from "@/lib/pacing/scenario/types"

export type CampaignDetailMetric = "spend" | "impressions" | "clicks" | "views"

export type CampaignDetailDailyWindow = {
  date_from?: string
  date_to?: string
}

export type CampaignDetailDailyLineSlice = {
  lineItemId: string
  label: string
  value: number
}

export type CampaignDetailDailyPoint = {
  date: string
  actual: number
  plan: number
  byLine: CampaignDetailDailyLineSlice[]
}

export type CampaignDetailDailySeries = {
  key: string
  label: string
  points: CampaignDetailDailyPoint[]
}

export type CampaignDetailDailyTableRow = {
  date: string
  spend: number
  impressions: number
  clicks: number
  views: number
  results: number
  lines: Array<{
    lineItemId: string
    label: string
    spend: number
    impressions: number
    clicks: number
    views: number
    results: number
  }>
}

export type CampaignDetailDaily = {
  series: CampaignDetailDailySeries[]
  metric: CampaignDetailMetric
  byMetric: Record<CampaignDetailMetric, CampaignDetailDailySeries[]>
  table: CampaignDetailDailyTableRow[]
  empty: boolean
}

export type CampaignDetailBurst = {
  lineItemId: string
  index: number
  name: string
  start: string
  end: string
  days: number
  budget: number
  spend: number
  expected: number
  pct: number
  status: LineCardPace
  impressions: number
  clicks: number
  views: number
  plannedDeliverable: number
  deliveredDeliverable: number
  perDayLeft: number | null
  empty?: boolean
}

export type CampaignDetailNote = {
  id: string
  at: string
  author: string
  body: string
  source: "insight" | "comment"
}

export type CampaignDetailPayload = {
  row: CampaignPacingRow
  lines: LineCardModel[]
  kpis: CampaignDetailKpiCard[]
  bursts: CampaignDetailBurst[]
  daily: CampaignDetailDaily
  read: CampaignRead | null
  notes: CampaignDetailNote[]
  scenarioLines: ScenarioLine[]
  clientId: number | null
}
