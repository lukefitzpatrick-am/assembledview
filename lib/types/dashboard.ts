export interface Campaign {
  mbaNumber: string
  campaignName: string
  versionNumber: string
  budget: number
  startDate: string
  endDate: string
  mediaTypes: string[]
  status: 'live' | 'planning' | 'completed' | 'approved' | 'booked' | 'draft'
}

export interface ClientDashboardData {
  clientName: string
  brandColour?: string
  liveCampaigns: number
  totalCampaignsYTD: number
  spendPast30Days: number
  spentYTD: number
  liveCampaignsList: Campaign[]
  planningCampaignsList: Campaign[]
  completedCampaignsList: Campaign[]
  spendByMediaType: Array<{
    mediaType: string
    amount: number
    percentage: number
  }>
  spendByCampaign: Array<{
    campaignName: string
    mbaNumber: string
    amount: number
    percentage: number
  }>
  monthlySpend: Array<{
    month: string
    data: Array<{
      mediaType: string
      amount: number
    }>
  }>
}

export interface Client {
  id: string
  name: string
  slug: string
  createdAt: string
  updatedAt: string
  brandColour?: string
}

