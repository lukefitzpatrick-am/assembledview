import { format } from "date-fns"

function toIsoDateOnly(value: unknown): string {
  if (value == null || value === "") return ""
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return format(value, "yyyy-MM-dd")
  }
  if (typeof value === "string") return value.trim()
  return String(value)
}

function mapBurstForGantt(burst: Record<string, unknown>, mediaTypeKey: string): Record<string, unknown> {
  const startDate = toIsoDateOnly(burst.startDate ?? burst.start_date)
  const endDate = toIsoDateOnly(burst.endDate ?? burst.end_date) || startDate

  if (mediaTypeKey === "production") {
    const cost = Number(burst.cost) || 0
    const amount = Number(burst.amount) || 0
    const mediaAmount = cost * amount
    return {
      ...burst,
      startDate,
      endDate,
      budget: String(mediaAmount),
      deliverables: amount,
      deliverablesAmount: mediaAmount,
    }
  }

  return {
    ...burst,
    startDate,
    endDate,
  }
}

/**
 * Clone line items and coerce burst dates to yyyy-MM-dd strings so
 * normaliseLineItemsByType + MediaGanttChart (parseISO) work with RHF Date values.
 */
export function serializeLineItemsForGantt(
  lineItems: unknown[] | null | undefined,
  mediaTypeKey: string
): any[] {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return []

  return lineItems.map((item) => {
    if (item == null || typeof item !== "object") return item
    const raw = item as Record<string, unknown>
    const burstsRaw = raw.bursts ?? raw.bursts_json
    const bursts = Array.isArray(burstsRaw)
      ? burstsRaw.map((b) =>
          b != null && typeof b === "object"
            ? mapBurstForGantt(b as Record<string, unknown>, mediaTypeKey)
            : b
        )
      : burstsRaw

    return {
      ...raw,
      bursts,
    }
  })
}
