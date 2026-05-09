import type { LineItem } from "@/lib/generateMediaPlan"

export type ProductionExportBurst = {
  cost?: number | string | null
  amount?: number | string | null
  startDate?: Date | string | null
  endDate?: Date | string | null
}

export type ProductionExportLineItem = {
  mediaType?: string | null
  publisher?: string | null
  description?: string | null
  market?: string | null
  lineItemId?: string | null
  bursts?: ProductionExportBurst[] | null
}

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ""))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const toDateOnly = (d?: Date | string | null): Date | null => {
  if (!d) return null
  const dateObj = d instanceof Date ? d : new Date(d)
  if (isNaN(dateObj.getTime())) return null
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
}

const formatDateString = (d?: Date | string | null): string => {
  const dateObj = toDateOnly(d)
  if (!dateObj) return ""
  const year = dateObj.getUTCFullYear()
  const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, "0")
  const day = dateObj.getUTCDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Map production form rows into the shared media-plan export LineItem shape.
 * The API/save row shape lacks top-level grossMedia/deliverables fields, so
 * callers must keep this export shape separate from API production rows.
 */
export function mapProductionLineItemsForExport(
  lineItems: ProductionExportLineItem[],
  mbaNumber: string
): LineItem[] {
  return lineItems.flatMap((lineItem, lineIndex) =>
    (lineItem.bursts ?? []).map((burst) => {
      const cost = toNumber(burst.cost)
      const amount = toNumber(burst.amount)
      const mediaAmount = cost * amount
      const lineId = lineItem.lineItemId || `${mbaNumber}PROD${lineIndex + 1}`

      return {
        market: lineItem.market || "",
        platform: "production",
        network: lineItem.publisher || "",
        creative: lineItem.description || "",
        startDate: formatDateString(burst.startDate),
        endDate: formatDateString(burst.endDate),
        deliverables: amount,
        buyType: "production",
        deliverablesAmount: cost.toString(),
        grossMedia: String(mediaAmount),
        line_item_id: lineId,
        line_item: lineIndex + 1,
      }
    })
  )
}
