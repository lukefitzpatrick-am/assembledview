export type Dv360DailyRow = {
  date: string
  lineItem?: string | null
  insertionOrder?: string | null
  spend: number
  impressions: number
  clicks: number
  conversions: number
  videoViews?: number
  matchedPostfix?: string | null
}
