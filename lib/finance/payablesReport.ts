import { deliveryLineItemClientPaysForMedia } from "@/lib/finance/deliverySchedulePayables"
import { matchMonthYear, parseBillingScheduleAmount } from "@/lib/finance/utils"

function deliveryLineDescription(lineItem: Record<string, unknown>, mediaTypeLabel: string): string {
  const h1 = lineItem.header1 != null ? String(lineItem.header1).trim() : ""
  const h2 = lineItem.header2 != null ? String(lineItem.header2).trim() : ""
  const targ =
    lineItem.targeting ??
    lineItem.creative_targeting ??
    lineItem.creativeTargeting ??
    lineItem.targeting_attribute ??
    lineItem.targetingAttribute
  const second = targ != null && String(targ).trim() ? String(targ).trim() : h2
  const parts = [h1, second].filter(Boolean)
  return parts.join(" ") || mediaTypeLabel
}

/**
 * One delivery-schedule line for the selected month (amount &gt; 0).
 * `clientPaysForMedia`: publisher invoices the client directly — excluded from agency payables totals but surfaced in UI.
 */
export type PayableDeliveryExtract = {
  publisherName: string
  mediaType: string
  /** Human-readable line detail (header / targeting), for grids and exports. */
  description: string
  amount: number
  mbaNumber: string
  clientId: number
  campaignName: string
  clientPaysForMedia: boolean
}

/** Version-level fields applied to every row returned for that schedule. */
export type PayableScheduleMeta = {
  mbaNumber: string
  clientId: number
  campaignName: string
}

/**
 * Normalise delivery schedule JSON to a month row array:
 * - top-level array
 * - `{ months: [...] }`
 * - `{ deliverySchedule: [...] }`
 */
export function parseDeliveryScheduleArray(deliverySchedule: unknown): unknown[] {
  if (!deliverySchedule) return []
  if (Array.isArray(deliverySchedule)) return deliverySchedule
  if (typeof deliverySchedule === "object" && deliverySchedule !== null) {
    const o = deliverySchedule as Record<string, unknown>
    if (Array.isArray(o.months)) return o.months
    if (Array.isArray(o.deliverySchedule)) return o.deliverySchedule
  }
  return []
}

/**
 * Extract payables lines from **delivery** schedule JSON (`media_plan_versions.deliverySchedule`),
 * not from `billingSchedule`. Includes client-paid lines with `clientPaysForMedia: true` for display;
 * agency totals must exclude those lines (see `sumPayableLineItems`).
 *
 * Parses: top-level array, `{ months: [...] }`, or `{ deliverySchedule: [...] }`.
 */
export function extractPayablesFromDeliverySchedule(
  deliverySchedule: unknown,
  selectedYear: number,
  selectedMonth: number,
  meta: PayableScheduleMeta = { mbaNumber: "", clientId: 0, campaignName: "" }
): PayableDeliveryExtract[] {
  const scheduleArray = parseDeliveryScheduleArray(deliverySchedule)
  const monthEntry = scheduleArray.find((entry: Record<string, unknown>) => {
    const monthLabel =
      entry?.monthYear ?? entry?.month_year ?? entry?.month ?? entry?.month_label
    return matchMonthYear(String(monthLabel ?? ""), selectedYear, selectedMonth)
  }) as Record<string, unknown> | undefined

  if (!monthEntry?.mediaTypes || !Array.isArray(monthEntry.mediaTypes)) return []

  const out: PayableDeliveryExtract[] = []

  for (const mediaTypeEntry of monthEntry.mediaTypes as Record<string, unknown>[]) {
    const mediaTypeDisplayName =
      (mediaTypeEntry.mediaType as string) ||
      (mediaTypeEntry.media_type as string) ||
      (mediaTypeEntry.type as string) ||
      (mediaTypeEntry.name as string) ||
      ""

    const lineItems = mediaTypeEntry.lineItems
    if (!Array.isArray(lineItems)) continue

    for (const lineItem of lineItems as Record<string, unknown>[]) {
      const amount = parseBillingScheduleAmount(lineItem.amount as string | number)
      if (amount <= 0) continue

      const clientPaysForMedia = deliveryLineItemClientPaysForMedia(lineItem)

      let publisherName = String(lineItem.header1 ?? "").trim()
      if (!publisherName && lineItem.lineItemId) {
        const parts = String(lineItem.lineItemId).split("-")
        if (parts.length >= 2) publisherName = parts[1]!.trim()
      }
      if (!publisherName) publisherName = "Unknown"

      out.push({
        publisherName,
        mediaType: mediaTypeDisplayName,
        description: deliveryLineDescription(lineItem, mediaTypeDisplayName),
        amount: Math.round(amount * 100) / 100,
        mbaNumber: meta.mbaNumber,
        clientId: meta.clientId,
        campaignName: meta.campaignName,
        clientPaysForMedia,
      })
    }
  }

  return out
}
