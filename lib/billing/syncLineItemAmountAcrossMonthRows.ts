import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

/**
 * The manual billing grid reads `lineItem` from `manualBillingMonths[0]` (first month) only.
 * After a deep clone, the same line id can exist on separate `BillingLineItem` instances per
 * `BillingMonth` — updates must set `monthlyAmounts[monthYear]` on every month row, not only
 * the column's month index.
 */
export function syncLineItemMonthlyAmountAcrossAllMonthRows(
  months: BillingMonth[],
  mediaKey: string,
  lineItemId: string,
  monthYear: string,
  numericValue: number
): void {
  for (const m of months) {
    if (!m.lineItems) continue
    const liObj = m.lineItems as Record<string, BillingLineItem[] | undefined>
    const list = liObj[mediaKey]
    if (!list) continue
    const li = list.find((l) => l.id === lineItemId)
    if (!li) continue
    li.monthlyAmounts[monthYear] = numericValue
    li.totalAmount = Object.values(li.monthlyAmounts).reduce((s, v) => s + (v || 0), 0)
  }
}
