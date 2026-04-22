import { generateBillingLineItems } from "@/lib/billing/generateBillingLineItems"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

export type MediaLineSourceMap = Record<string, { lineItems: any[]; key: string }>

const emptyMediaCosts = (fmt: Intl.NumberFormat): BillingMonth["mediaCosts"] => ({
  search: fmt.format(0),
  socialMedia: fmt.format(0),
  television: fmt.format(0),
  radio: fmt.format(0),
  newspaper: fmt.format(0),
  magazines: fmt.format(0),
  ooh: fmt.format(0),
  cinema: fmt.format(0),
  digiDisplay: fmt.format(0),
  digiAudio: fmt.format(0),
  digiVideo: fmt.format(0),
  bvod: fmt.format(0),
  integration: fmt.format(0),
  progDisplay: fmt.format(0),
  progVideo: fmt.format(0),
  progBvod: fmt.format(0),
  progAudio: fmt.format(0),
  progOoh: fmt.format(0),
  influencers: fmt.format(0),
  production: fmt.format(0),
})

/**
 * Clone billing months and attach container-derived line items (same as opening Manual Billing on create).
 * Used when exporting while still on auto billing (no persisted line-item breakdown).
 */
export function prepareBillingMonthsForLineItemExport(
  baseMonths: BillingMonth[],
  mediaTypeMap: MediaLineSourceMap,
  isMediaEnabled: (mpFormKey: string) => boolean
): BillingMonth[] {
  const deepCopiedMonths = JSON.parse(JSON.stringify(baseMonths)) as BillingMonth[]
  if (deepCopiedMonths.length === 0) return []

  const allLineItems: Record<string, BillingLineItem[]> = {}
  Object.entries(mediaTypeMap).forEach(([mediaTypeKey, { lineItems, key }]) => {
    if (isMediaEnabled(mediaTypeKey) && lineItems) {
      const billingLineItems = generateBillingLineItems(lineItems, key, deepCopiedMonths, "billing")
      if (billingLineItems.length > 0) {
        allLineItems[key] = billingLineItems
      }
    }
  })

  const currencyFormatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })
  deepCopiedMonths.forEach((month: BillingMonth) => {
    if (!month.lineItems) month.lineItems = {}
    if (!month.mediaCosts) {
      month.mediaCosts = emptyMediaCosts(currencyFormatter)
    }
    if (month.production === undefined) {
      month.production = currencyFormatter.format(0)
    }
    Object.entries(allLineItems).forEach(([key, lineItems]) => {
      month.lineItems![key as keyof typeof month.lineItems] = lineItems
    })
  })

  return deepCopiedMonths
}
