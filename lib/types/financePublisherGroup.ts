import type { BillingRecord } from "@/lib/types/financeBilling"

export type PublisherCampaignRow = {
  billingRecordId: number
  clientName: string
  mbaNumber: string
  campaignName: string
  totalMedia: number
  status: BillingRecord["status"]
  billingType: BillingRecord["billing_type"]
}

export type PublisherGroup = {
  publisherName: string
  subtotal: number
  clients: Array<{
    clientName: string
    campaigns: PublisherCampaignRow[]
  }>
}
