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

  // Flat monthly schedule (SOW create/edit): `{ month, cost }` with no nested lineItems/mediaTypes.
  // Use that month's scheduled amount — do not fall through to the full scope cost total.
  if (lineItems.length === 0) {
    const flatAmount = parseBillingScheduleAmount(
      (monthEntry.cost ?? monthEntry.amount) as string | number
    )
    if (flatAmount > 0) {
      lineItems.push({
        itemCode: "SOW",
        mediaType: "Scope of Work",
        description: String(monthEntry.month ?? monthEntry.monthYear ?? "Scope of Work"),
        amount: flatAmount,
        publisherName: null,
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

function scheduleArrayFromUnknown(billingSchedule: unknown): unknown[] {
  if (!billingSchedule) return []
  if (Array.isArray(billingSchedule)) return billingSchedule
  if (
    typeof billingSchedule === "object" &&
    billingSchedule !== null &&
    Array.isArray((billingSchedule as Record<string, unknown>).months)
  ) {
    return (billingSchedule as { months: unknown[] }).months
  }
  return []
}

/** True when a billing_schedule payload exists (even if every month is $0). */
export function scopeHasBillingSchedule(billingSchedule: unknown): boolean {
  return scheduleArrayFromUnknown(billingSchedule).length > 0
}

export type ScopeScheduleCoverage = {
  /** Months in `year` with a scheduled amount > 0. */
  scheduledMonths: number
  /** Months in `year` with no positive scheduled amount (missing or $0). */
  unscheduledMonths: number
  /** Present-tense gap label, e.g. "10 months unscheduled"; null when fully covered. */
  gapLabel: string | null
}

/**
 * Calendar-year coverage for a SOW flat/nested schedule.
 * A year is considered in scope when the schedule has any entry touching that year,
 * or when analyzing an empty schedule against an explicit year (all 12 unscheduled).
 */
export function summarizeScopeScheduleCoverage(
  billingSchedule: unknown,
  year: number,
): ScopeScheduleCoverage {
  const scheduleArray = scheduleArrayFromUnknown(billingSchedule)
  let scheduledMonths = 0
  for (let month = 1; month <= 12; month++) {
    const items = extractLineItemsFromScopeSchedule(scheduleArray, year, month)
    const total = items.reduce((s, li) => s + li.amount, 0)
    if (total > 0) scheduledMonths++
  }
  const unscheduledMonths = 12 - scheduledMonths
  const gapLabel =
    unscheduledMonths > 0
      ? `${unscheduledMonths} month${unscheduledMonths === 1 ? "" : "s"} unscheduled`
      : null
  return { scheduledMonths, unscheduledMonths, gapLabel }
}
