export type BuyType =
  | "CPM"
  | "CPC"
  | "CPA"
  | "CPV"
  | "LEADS"
  | "BONUS"
  | "FIXED COST"
  | "SUMMARY"

export type Burst = {
  start_date: string
  end_date: string
  startDate?: string
  endDate?: string
  media_investment: number
  deliverables: number
  budget_number?: number
  calculated_value_number?: number
  buy_amount_number?: number
}

export type ActualsDaily = {
  date: string
  spend: number
  impressions: number
  clicks: number
  results: number
  video_3s_views: number
}
