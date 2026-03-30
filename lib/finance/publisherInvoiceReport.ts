import { matchMonthYear, parseBillingScheduleAmount } from "@/lib/finance/utils"

export type PublisherInvoiceCampaignRow = {
  mbaNumber: string
  campaignName: string
  totalMedia: number
}

export type PublisherInvoiceClientGroup = {
  clientName: string
  campaigns: PublisherInvoiceCampaignRow[]
  subtotal: number
}

export type PublisherInvoicePublisherGroup = {
  publisherName: string
  clients: PublisherInvoiceClientGroup[]
  subtotal: number
}

export type PublisherInvoiceSection = {
  publishers: PublisherInvoicePublisherGroup[]
  grandTotal: number
}

const U = "\u001f"

function parseBillingScheduleArray(billingSchedule: unknown): any[] {
  if (!billingSchedule) return []
  if (Array.isArray(billingSchedule)) return billingSchedule
  if (
    typeof billingSchedule === "object" &&
    billingSchedule !== null &&
    Array.isArray((billingSchedule as any).months)
  ) {
    return (billingSchedule as any).months
  }
  return []
}

/**
 * Media amounts from the billing schedule for a month that the agency expects to pay suppliers for
 * (excludes line items flagged client pays for media when that flag is present on saved JSON).
 */
export function extractPublisherBillableMediaFromBillingSchedule(
  billingSchedule: unknown,
  selectedYear: number,
  selectedMonth: number
): Array<{ publisherName: string; mediaType: string; amount: number }> {
  const scheduleArray = parseBillingScheduleArray(billingSchedule)
  const monthEntry = scheduleArray.find((entry) => {
    const monthLabel =
      entry?.monthYear ?? entry?.month_year ?? entry?.month ?? entry?.month_label
    return matchMonthYear(String(monthLabel ?? ""), selectedYear, selectedMonth)
  })

  if (!monthEntry?.mediaTypes) return []

  const out: Array<{ publisherName: string; mediaType: string; amount: number }> = []

  for (const mediaTypeEntry of monthEntry.mediaTypes) {
    const mediaTypeDisplayName =
      mediaTypeEntry.mediaType ||
      mediaTypeEntry.media_type ||
      mediaTypeEntry.type ||
      mediaTypeEntry.name ||
      ""

    const lineItems = mediaTypeEntry.lineItems
    if (!Array.isArray(lineItems)) continue

    for (const lineItem of lineItems) {
      const amount = parseBillingScheduleAmount(lineItem.amount)
      if (amount <= 0) continue

      const clientPays =
        lineItem.clientPaysForMedia === true ||
        lineItem.client_pays_for_media === true
      if (clientPays) continue

      let publisherName = String(lineItem.header1 ?? "").trim()
      if (!publisherName && lineItem.lineItemId) {
        const parts = String(lineItem.lineItemId).split("-")
        if (parts.length >= 2) publisherName = parts[1].trim()
      }
      if (!publisherName) publisherName = "Unknown"

      out.push({
        publisherName,
        mediaType: mediaTypeDisplayName,
        amount: Math.round(amount * 100) / 100,
      })
    }
  }

  return out
}

export type PublisherInvoiceContribution = {
  publisherName: string
  clientName: string
  mbaNumber: string
  campaignName: string
  amount: number
}

/**
 * Roll up line-level billing extracts into Publisher → Client → MBA/Campaign totals.
 */
export function aggregatePublisherInvoiceContributions(
  rows: PublisherInvoiceContribution[]
): PublisherInvoiceSection {
  const cellTotals = new Map<string, number>()
  for (const r of rows) {
    const key = [r.publisherName, r.clientName, r.mbaNumber, r.campaignName].join(U)
    cellTotals.set(key, (cellTotals.get(key) ?? 0) + r.amount)
  }

  const byPublisher = new Map<
    string,
    Map<string, Map<string, { mbaNumber: string; campaignName: string; totalMedia: number }>>
  >()

  for (const [key, totalMedia] of cellTotals) {
    const [publisherName, clientName, mbaNumber, campaignName] = key.split(U)
    let clientMap = byPublisher.get(publisherName)
    if (!clientMap) {
      clientMap = new Map()
      byPublisher.set(publisherName, clientMap)
    }
    let campaignMap = clientMap.get(clientName)
    if (!campaignMap) {
      campaignMap = new Map()
      clientMap.set(clientName, campaignMap)
    }
    const campKey = `${mbaNumber}${U}${campaignName}`
    const rounded = Math.round(totalMedia * 100) / 100
    campaignMap.set(campKey, { mbaNumber, campaignName, totalMedia: rounded })
  }

  const publisherNames = [...byPublisher.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  )

  let grandTotal = 0
  const publishers: PublisherInvoicePublisherGroup[] = []

  for (const publisherName of publisherNames) {
    const clientMap = byPublisher.get(publisherName)!
    const clientNames = [...clientMap.keys()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    )

    const clients: PublisherInvoiceClientGroup[] = []
    let publisherSubtotal = 0

    for (const clientName of clientNames) {
      const campaignMap = clientMap.get(clientName)!
      const campaigns: PublisherInvoiceCampaignRow[] = [...campaignMap.values()].sort((a, b) => {
        const m = a.mbaNumber.localeCompare(b.mbaNumber, undefined, { sensitivity: "base" })
        if (m !== 0) return m
        return a.campaignName.localeCompare(b.campaignName, undefined, { sensitivity: "base" })
      })
      const clientSubtotal = Math.round(
        campaigns.reduce((s, c) => s + c.totalMedia, 0) * 100
      ) / 100
      publisherSubtotal += clientSubtotal
      clients.push({ clientName, campaigns, subtotal: clientSubtotal })
    }

    publisherSubtotal = Math.round(publisherSubtotal * 100) / 100
    grandTotal += publisherSubtotal
    publishers.push({ publisherName, clients, subtotal: publisherSubtotal })
  }

  grandTotal = Math.round(grandTotal * 100) / 100
  return { publishers, grandTotal }
}
