import type { CampaignRead } from "@/lib/campaign-read/types"
import type { LineCardModel, LineCardPace } from "@/lib/pacing/channel/lineCardTypes"
import type { CampaignDetailKpiCard } from "@/lib/pacing/detail/kpisFromLines"
import type { CampaignPacingRow } from "@/lib/pacing/portfolio/types"
import type { ScenarioLine } from "@/lib/pacing/scenario/types"

export type CampaignDetailMetric = "spend" | "impressions" | "clicks" | "views"

export type CampaignDetailDailyPoint = {
  date: string
  actual: number
  plan: number
}

export type CampaignDetailDailySeries = {
  key: string
  label: string
  points: CampaignDetailDailyPoint[]
}

export type CampaignDetailDaily = {
  series: CampaignDetailDailySeries[]
  metric: CampaignDetailMetric
  byMetric: Record<CampaignDetailMetric, CampaignDetailDailySeries[]>
}

export type CampaignDetailBurst = {
  lineItemId: string
  index: number
  start: string
  end: string
  days: number
  budget: number
  spend: number
  pct: number
  status: LineCardPace
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
