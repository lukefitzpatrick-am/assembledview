/**
 * Map core {@link BillingMonth} schedule rows (from
 * {@link computeCampaignFinancialsFromVersion}) into finance receivable / payable
 * line shapes — without re-peeling persisted mediaTypes JSON.
 */

import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import type { PayableDeliveryExtract, PayableScheduleMeta } from "@/lib/finance/payablesReport"
import {
  buildItemCode,
  formatDescriptionToNaturalLanguage,
  getMediaTypeKeyFromDisplayName,
  type FinanceLineItem,
} from "@/lib/finance/utils"
import { parseMoneyInput, roundMoney2 } from "@/lib/format/money"

const MEDIA_KEY_LABELS: Record<string, string> = {
  search: "Search",
  socialMedia: "Social Media",
  television: "Television",
  radio: "Radio",
  newspaper: "Newspaper",
  magazines: "Magazines",
  ooh: "OOH",
  cinema: "Cinema",
  digiDisplay: "Digital Display",
  digiAudio: "Digital Audio",
  digiVideo: "Digital Video",
  bvod: "BVOD",
  integration: "Integration",
  progDisplay: "Programmatic Display",
  progVideo: "Programmatic Video",
  progBvod: "Programmatic BVOD",
  progAudio: "Programmatic Audio",
  progOoh: "Programmatic OOH",
  influencers: "Influencers",
  production: "Production",
}

function mediaKeyLabel(mediaKey: string): string {
  return MEDIA_KEY_LABELS[mediaKey] ?? mediaKey
}

function parseScheduleMoney(value: string | undefined): number {
  return parseMoneyInput(value ?? 0) ?? 0
}

function lineAmountForMonth(item: BillingLineItem, monthYear: string): number {
  const raw = item.monthlyAmounts?.[monthYear]
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0
}

/**
 * Receivable media lines for one core billing month.
 * Only amounts &gt; 0 (client-pays media already zeroed on billing schedule).
 */
export function financeMediaLinesFromBillingMonth(
  month: BillingMonth,
  publisherMap: Map<string, { billingagency?: string | null }>
): FinanceLineItem[] {
  const lineItems = month.lineItems
  if (!lineItems) return []

  const out: FinanceLineItem[] = []
  for (const [mediaKey, items] of Object.entries(lineItems)) {
    if (!Array.isArray(items) || items.length === 0) continue
    const mediaTypeDisplayName = mediaKeyLabel(mediaKey)
    const mediaTypeKeyForDesc =
      getMediaTypeKeyFromDisplayName(mediaTypeDisplayName) || mediaKey

    for (const item of items) {
      const amount = roundMoney2(lineAmountForMonth(item, month.monthYear))
      if (amount <= 0) continue

      let billingAgency: string | null = null
      const header1 = String(item.header1 ?? "").trim()
      if (item.id) {
        const parts = String(item.id).split("-")
        if (parts.length >= 2) {
          const possiblePublisher = parts[1]
          const publisher = publisherMap.get(possiblePublisher!)
          if (publisher) billingAgency = publisher.billingagency || null
        }
      }
      if (!billingAgency && header1) {
        const publisher = publisherMap.get(header1)
        if (publisher) billingAgency = publisher.billingagency || null
      }

      const descriptionParts: string[] = []
      if (header1) {
        descriptionParts.push(formatDescriptionToNaturalLanguage(header1))
      }
      const useTargetingInsteadOfBidStrategy = [
        "search",
        "socialMedia",
        "progDisplay",
        "progVideo",
        "progBvod",
        "progAudio",
        "progOoh",
      ].includes(mediaTypeKeyForDesc)

      const secondPart = useTargetingInsteadOfBidStrategy
        ? (item as BillingLineItem & { targeting?: string }).targeting ?? item.header2
        : item.header2
      if (secondPart) {
        descriptionParts.push(formatDescriptionToNaturalLanguage(String(secondPart)))
      }

      out.push({
        itemCode: buildItemCode(billingAgency, mediaTypeDisplayName),
        mediaType: mediaTypeDisplayName,
        description: descriptionParts.join(" ") || mediaTypeDisplayName,
        amount,
        publisherName: header1 || null,
        planLineItemId: item.id?.trim() ? item.id.trim() : null,
        billingMode: item.billingMode === "auto" || item.billingMode === "manual"
          ? item.billingMode
          : null,
      })
    }
  }
  return out
}

/** Month header fee / adserving / production from a core billing month. */
export function serviceAmountsFromBillingMonth(month: BillingMonth): {
  adservingTechFees: number
  production: number
  assembledFee: number
} {
  return {
    adservingTechFees: roundMoney2(parseScheduleMoney(month.adservingTechFees)),
    production: roundMoney2(parseScheduleMoney(month.production)),
    assembledFee: roundMoney2(parseScheduleMoney(month.feeTotal)),
  }
}

function deliveryLineDescription(item: BillingLineItem, mediaTypeLabel: string): string {
  const h1 = item.header1?.trim() || ""
  const h2 = item.header2?.trim() || ""
  const parts = [h1, h2].filter(Boolean)
  return parts.join(" ") || mediaTypeLabel
}

/**
 * Payable media lines for one core delivery month (includes client-pays for UI;
 * agency totals exclude them).
 */
export function payablesFromDeliveryMonth(
  month: BillingMonth,
  meta: PayableScheduleMeta
): PayableDeliveryExtract[] {
  const lineItems = month.lineItems
  if (!lineItems) return []

  const out: PayableDeliveryExtract[] = []
  for (const [mediaKey, items] of Object.entries(lineItems)) {
    if (!Array.isArray(items) || items.length === 0) continue
    if (mediaKey === "production") continue
    const mediaTypeDisplayName = mediaKeyLabel(mediaKey)

    for (const item of items) {
      const amount = roundMoney2(lineAmountForMonth(item, month.monthYear))
      if (amount <= 0) continue

      let publisherName = String(item.header1 ?? "").trim()
      if (!publisherName && item.id) {
        const parts = String(item.id).split("-")
        if (parts.length >= 2) publisherName = parts[1]!.trim()
      }
      if (!publisherName) publisherName = "Unknown"

      out.push({
        publisherName,
        mediaType: mediaTypeDisplayName,
        description: deliveryLineDescription(item, mediaTypeDisplayName),
        amount,
        mbaNumber: meta.mbaNumber,
        clientId: meta.clientId,
        campaignName: meta.campaignName,
        clientPaysForMedia: item.clientPaysForMedia === true,
      })
    }
  }
  return out
}

/** Agency-owed media on a delivery month (excludes client-pays). */
export function agencyOwedDeliveryMediaTotal(month: BillingMonth): number {
  return roundMoney2(
    payablesFromDeliveryMonth(month, {
      mbaNumber: "",
      clientId: 0,
      campaignName: "",
    })
      .filter((r) => !r.clientPaysForMedia)
      .reduce((s, r) => s + r.amount, 0)
  )
}
