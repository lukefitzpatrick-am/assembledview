import { BuyType } from "./mockMetaPacing"

type DeliverableKey =
  | "impressions"
  | "clicks"
  | "video_3s_views"
  | "results"
  | "deliverable_value"

export type PacingSeriesPoint = {
  date: string
  expectedSpend: number
  actualSpend: number
  expectedDeliverable: number
  actualDeliverable: number
}

export type PacingResult = {
  asAtDate: string | null
  spend: {
    actualToDate: number
    expectedToDate: number
    delta: number
    pacingPct: number
    goalTotal: number
  }
  deliverable?: {
    actualToDate: number
    expectedToDate: number
    delta: number
    pacingPct: number
    goalTotal: number
  }
  series: PacingSeriesPoint[]
}

export function getDeliverableKey(buyType: BuyType): DeliverableKey | null {
  switch (buyType) {
    case "CPM":
      return "impressions"
    case "CPC":
      return "clicks"
    case "CPA":
      return "results"
    case "CPV":
      return "video_3s_views"
    case "LEADS":
    case "BONUS":
      return "results"
    case "FIXED COST":
      return null
    case "SUMMARY":
      return "deliverable_value"
    default:
      return null
  }
}
