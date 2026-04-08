import { matchMonthYear, parseBillingScheduleAmount, type FinanceLineItem } from "@/lib/finance/utils"

export function parseScopeJSON(val: unknown): unknown {
  if (val == null) return null
  if (typeof val !== "string") return val
  try {
    return JSON.parse(val) as unknown
  } catch {
    return null
  }
}

export function findMonthEntryInSchedule(schedule: unknown[], year: number, month: number): Record<string, unknown> | undefined {
  return schedule.find((entry: Record<string, unknown>) => {
    const label = entry?.monthYear ?? entry?.month_year ?? entry?.month ?? entry?.month_label
    return matchMonthYear(String(label ?? ""), year, month)
  }) as Record<string, unknown> | undefined
}

/**
 * Scope-of-work billing_schedule month slice → line items (same rules as legacy `/api/finance/sow`).
 */
export function extractLineItemsFromScopeSchedule(
  billingSchedule: unknown,
  year: number,
  month: number
): FinanceLineItem[] {
  if (!billingSchedule) return []

  let scheduleArray: unknown[] = []
  if (Array.isArray(billingSchedule)) {
    scheduleArray = billingSchedule
  } else if (
    typeof billingSchedule === "object" &&
    billingSchedule !== null &&
    Array.isArray((billingSchedule as Record<string, unknown>).months)
  ) {
    scheduleArray = (billingSchedule as { months: unknown[] }).months
  } else {
    return []
  }

  const monthEntry = findMonthEntryInSchedule(scheduleArray, year, month)
  if (!monthEntry) return []

  const lineItems: FinanceLineItem[] = []

  if (Array.isArray(monthEntry.lineItems)) {
    monthEntry.lineItems.forEach((item: Record<string, unknown>, idx: number) => {
      const amount = parseBillingScheduleAmount(item.amount as string | number)
      if (amount > 0) {
        lineItems.push({
          itemCode: String(item.itemCode ?? "SOW"),
          mediaType: String(item.mediaType ?? "Scope of Work"),
          description: String(item.description ?? item.name ?? `Line Item ${idx + 1}`),
          amount,
          publisherName: null,
        })
      }
    })
  }

  if (Array.isArray(monthEntry.mediaTypes)) {
    for (const mediaType of monthEntry.mediaTypes as Record<string, unknown>[]) {
      if (!Array.isArray(mediaType.lineItems)) continue
      mediaType.lineItems.forEach((item: Record<string, unknown>, idx: number) => {
        const amount = parseBillingScheduleAmount(item.amount as string | number)
        if (amount > 0) {
          lineItems.push({
            itemCode: String(item.itemCode ?? "SOW"),
            mediaType: String(
              mediaType.mediaType ?? mediaType.name ?? "Scope of Work"
            ),
            description: String(
              item.description ?? item.header1 ?? item.header2 ?? `Line Item ${idx + 1}`
            ),
            amount,
            publisherName: item.header1 != null ? String(item.header1).trim() || null : null,
          })
        }
      })
    }
  }

  return lineItems
}

export function extractLineItemsFromScopeCost(cost: unknown): FinanceLineItem[] {
  if (!cost) return []
  const itemsArray = Array.isArray(cost) ? cost : [cost]
  return itemsArray
    .map((item: Record<string, unknown>, idx: number) => {
      const amount = parseBillingScheduleAmount(
        (item.amount ?? item.cost ?? item.value) as string | number
      )
      return {
        itemCode: "SOW",
        mediaType: "Scope of Work",
        description: String(item.description ?? item.name ?? `Line Item ${idx + 1}`),
        amount,
        publisherName: null,
      }
    })
    .filter((item) => item.amount > 0)
}
