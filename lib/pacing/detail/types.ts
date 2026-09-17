import type { CampaignRead } from "@/lib/campaign-read/types"
import type { KpiReviewCard } from "@/lib/kpi/kpiReview"
import type { LineCardModel, LineCardPace } from "@/lib/pacing/channel/lineCardTypes"
import type { CampaignPacingRow } from "@/lib/pacing/portfolio/types"

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
  kpis: KpiReviewCard[]
  bursts: CampaignDetailBurst[]
  daily: CampaignDetailDaily
  read: CampaignRead | null
  notes: CampaignDetailNote[]
}
