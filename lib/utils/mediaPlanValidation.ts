import { isValid, startOfDay } from "date-fns"

/** Keys for the 18 standard media container lifted-state arrays. */
export type MediaLineItemKey =
  | "televisionMediaLineItems"
  | "radioMediaLineItems"
  | "newspaperMediaLineItems"
  | "magazineMediaLineItems"
  | "oohMediaLineItems"
  | "cinemaMediaLineItems"
  | "digiDisplayMediaLineItems"
  | "digiAudioMediaLineItems"
  | "digiVideoMediaLineItems"
  | "bvodMediaLineItems"
  | "integrationMediaLineItems"
  | "searchMediaLineItems"
  | "socialMediaMediaLineItems"
  | "progDisplayMediaLineItems"
  | "progVideoMediaLineItems"
  | "progBvodMediaLineItems"
  | "progAudioMediaLineItems"
  | "progOohMediaLineItems"
  | "influencersMediaLineItems"

export type MediaLineItemLike = {
  bursts?: Array<{ startDate?: unknown; endDate?: unknown }>
  bursts_json?: string | Array<{ startDate?: unknown; endDate?: unknown }>
}

export type ProductionLineItemLike = MediaLineItemLike

type BurstLike = { startDate?: unknown; endDate?: unknown }

function parseToDate(value: unknown): Date | null {
  if (value == null) return null
  const parsed = value instanceof Date ? value : new Date(value as string | number)
  if (!isValid(parsed)) return null
  return parsed
}

function normalizeCampaignDate(value: Date | null | undefined): Date | null {
  const parsed = parseToDate(value)
  if (!parsed) return null
  return startOfDay(parsed)
}

function resolveBursts(lineItem: MediaLineItemLike): BurstLike[] {
  if (Array.isArray(lineItem.bursts)) {
    return lineItem.bursts
  }

  if (lineItem.bursts_json == null) {
    return []
  }

  if (Array.isArray(lineItem.bursts_json)) {
    return lineItem.bursts_json
  }

  if (typeof lineItem.bursts_json === "string") {
    try {
      const parsed = JSON.parse(lineItem.bursts_json)
      return Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    } catch {
      return []
    }
  }

  return []
}

function lineItemHasBurstViolation(
  lineItem: MediaLineItemLike,
  campaignStart: Date,
  campaignEnd: Date
): boolean {
  const bursts = resolveBursts(lineItem)
  if (bursts.length === 0) return false

  for (const burst of bursts) {
    if (!burst) continue

    const startDate = parseToDate(burst.startDate)
    const endDate = parseToDate(burst.endDate)
    if (!startDate || !endDate) continue

    const burstStart = startOfDay(startDate)
    const burstEnd = startOfDay(endDate)

    if (burstStart < campaignStart || burstEnd > campaignEnd) {
      return true
    }
  }

  return false
}

/**
 * Returns whether any line items have flight dates outside the campaign window.
 *
 * Comparison rule (date-only via startOfDay on all values):
 * A burst violates if burst.startDate < campaignStart OR burst.endDate > campaignEnd.
 * A line item violates if any of its bursts violate.
 * offendingCount is the number of distinct violating line items (not bursts).
 */
export function checkLineItemDatesOutsideCampaign(params: {
  campaignStart: Date | null | undefined
  campaignEnd: Date | null | undefined
  mediaLineItems: Partial<Record<MediaLineItemKey, MediaLineItemLike[]>>
  productionLineItems?: ProductionLineItemLike[]
}): { hasViolation: boolean; offendingCount: number } {
  const campaignStart = normalizeCampaignDate(params.campaignStart)
  const campaignEnd = normalizeCampaignDate(params.campaignEnd)

  if (!campaignStart || !campaignEnd) {
    return { hasViolation: false, offendingCount: 0 }
  }

  let offendingCount = 0

  const mediaArrays = Object.values(params.mediaLineItems)
  for (const mediaArray of mediaArrays) {
    if (!Array.isArray(mediaArray)) continue

    for (const lineItem of mediaArray) {
      if (lineItem && lineItemHasBurstViolation(lineItem, campaignStart, campaignEnd)) {
        offendingCount += 1
      }
    }
  }

  if (params.productionLineItems) {
    for (const lineItem of params.productionLineItems) {
      if (lineItem && lineItemHasBurstViolation(lineItem, campaignStart, campaignEnd)) {
        offendingCount += 1
      }
    }
  }

  return {
    hasViolation: offendingCount > 0,
    offendingCount,
  }
}
