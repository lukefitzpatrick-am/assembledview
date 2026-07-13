import { applyBillingLineMode } from "@/lib/billing/applyBillingLineMode"
import { formatBillingCurrency, recalculateBillingMonths } from "@/lib/billing/recalculateBillingMonths"
import { syncLineItemMonthlyAmountAcrossAllMonthRows } from "@/lib/billing/syncLineItemAmountAcrossMonthRows"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

export type ScheduleMonthCostField = "feeTotal" | "adservingTechFees" | "production"

function deepCloneMonths(months: BillingMonth[]): BillingMonth[] {
  return JSON.parse(JSON.stringify(months)) as BillingMonth[]
}

export function findMediaKeyForScheduleLine(
  months: BillingMonth[],
  lineItemId: string
): string | null {
  for (const m of months) {
    if (!m.lineItems) continue
    for (const [key, items] of Object.entries(m.lineItems)) {
      const arr = items as BillingLineItem[] | undefined
      if (arr?.some((li) => li.id === lineItemId)) return key
    }
  }
  return null
}

/**
 * Apply a single line/month amount change (Alter Billing cell semantics) and stamp the line manual.
 * Does not enforce grand-total invariance — that constraint is dialog-only.
 */
export function applyScheduleLineAmountEdit(
  months: BillingMonth[],
  params: {
    lineItemId: string
    monthYear: string
    amount: number
    stampManual?: boolean
  }
): BillingMonth[] | null {
  const mediaKey = findMediaKeyForScheduleLine(months, params.lineItemId)
  if (!mediaKey) return null

  const copy = deepCloneMonths(months)
  syncLineItemMonthlyAmountAcrossAllMonthRows(
    copy,
    mediaKey,
    params.lineItemId,
    params.monthYear,
    params.amount
  )
  recalculateBillingMonths(copy)

  if (params.stampManual !== false) {
    return applyBillingLineMode(copy, params.lineItemId, "manual")
  }
  return copy
}

/**
 * Apply a month-level fee / adserving / production amount change.
 */
export function applyScheduleMonthCostEdit(
  months: BillingMonth[],
  params: {
    monthYear: string
    field: ScheduleMonthCostField
    amount: number
  }
): BillingMonth[] | null {
  const copy = deepCloneMonths(months)
  const month = copy.find((m) => m.monthYear === params.monthYear)
  if (!month) return null

  const formatted = formatBillingCurrency(params.amount)
  month[params.field] = formatted
  if (params.field === "production" && month.mediaCosts?.production !== undefined) {
    month.mediaCosts.production = formatted
  }
  recalculateBillingMonths(copy)
  return copy
}

export function feeItemCodeToCostField(
  itemCode: string
): ScheduleMonthCostField | null {
  const code = itemCode.trim().toLowerCase()
  if (code === "t.adserving") return "adservingTechFees"
  if (code === "production") return "production"
  if (code === "service") return "feeTotal"
  return null
}
