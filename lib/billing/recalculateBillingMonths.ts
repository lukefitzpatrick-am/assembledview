import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

const currencyFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function parseCurrency(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value !== "string") return 0
  const n = parseFloat(value.replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

/**
 * Recalculates mediaCosts / mediaTotal / totalAmount for every month from its line items.
 * Production is kept separate from mediaTotal (matches edit-page / Alter Billing behaviour).
 */
export function recalculateBillingMonths(months: BillingMonth[]): void {
  months.forEach((m) => {
    if (!m.mediaCosts) return
    let mediaTotalNum = 0
    Object.entries(m.lineItems || {}).forEach(([mediaKey, items]) => {
      const arr = items as BillingLineItem[] | undefined
      if (!arr?.length) return
      const sum = arr.reduce((s, li) => s + (li.monthlyAmounts?.[m.monthYear] || 0), 0)
      if (mediaKey in m.mediaCosts!) {
        ;(m.mediaCosts as Record<string, string>)[mediaKey] = currencyFormatter.format(sum)
      }
      if (mediaKey !== "production") mediaTotalNum += sum
    })
    const fee = parseCurrency(m.feeTotal)
    const adserv = parseCurrency(m.adservingTechFees)
    const prod = parseCurrency(m.production)
    m.mediaTotal = currencyFormatter.format(mediaTotalNum)
    m.totalAmount = currencyFormatter.format(mediaTotalNum + fee + adserv + prod)
  })
}

export function formatBillingCurrency(value: number): string {
  return currencyFormatter.format(value)
}
