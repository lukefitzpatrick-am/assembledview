export interface Campaign {
  mbaNumber: string
  campaignName: string
  versionNumber: string
  /** Numeric version for edit URLs (`/mediaplans/mba/.../edit?version=`) */
  version_number: number
  budget: number
  startDate: string
  endDate: string
  mediaTypes: string[]
  status: 'live' | 'planning' | 'completed' | 'approved' | 'booked' | 'draft'
  /**
   * Expected spend to date from billing schedule (`lib/spend/billingScheduleExpectedToDate`),
   * same model as mediaplans API / MBA dashboard.
   */
  expectedSpendToDate?: number
}

/** Admin client hub card (metrics match tenant dashboard definitions). */
export interface ClientHubSummary {
  id: number
  slug: string
  clientName: string
  liveCampaigns: number
  totalSpend: number
  /** Client brand colour from dashboard / Xano (`brand_colour`) when available */
  brandColour?: string
}

/** Matches `FinanceModal` `finance` prop when the dashboard supplies a pre-built summary. */
export type ClientDashboardFinancePayload = {
  totalBudget: number
  ytdSpend: number
  currency: string
  budgetByQuarter: Array<{
    quarter: string
    budget: number
    spent: number
    status: "complete" | "in-progress" | "planned"
  }>
  spendByMediaType: Array<{
    mediaType: string
    amount: number
    percentage: number
  }>
  recentTransactions?: Array<{
    id: string
    description: string
    date: string
    amount: number
    type: "expense" | "credit" | "adjustment"
  }>
  outstandingInvoices?: {
    count: number
    totalAmount: number
    nextInvoiceDate?: string
    paymentStatus?: "on-track" | "overdue" | "due-soon"
  }
}

export interface ClientDashboardData {
  clientName: string
  brandColour?: string
  /** Raw Xano client row for `EditClientForm` / client details modal (merged in by pages when available). */
  clientRecord?: Record<string, unknown> | null
  /** Optional logo URL for hero (merged in by pages when available). */
  clientLogo?: string | null
  /** Optional finance modal payload; when omitted, the dashboard page derives a summary from campaigns. */
  finance?: ClientDashboardFinancePayload
  liveCampaigns: number
  totalCampaignsYTD: number
  spendPast30Days: number
  totalSpend: number
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

export interface GlobalMonthlySpend {
  month: string
  amount: number
}

export interface GlobalMonthlyPublisherSpend {
  month: string
  data: Array<{
    publisher: string
    amount: number
  }>
}

export interface GlobalMonthlyClientSpend {
  month: string
  data: Array<{
    client: string
    amount: number
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

