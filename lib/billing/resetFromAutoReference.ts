import type { BillingLineItem, BillingMonth } from "./types"

/**
 * Explicit resets from burst-derived auto (`autoReferenceBillingMonths` on MBA edit). Full or per-line replace of
 * **working** billing — not the append-only path. Auto never overwrites existing working line amounts except via
 * these helpers (plus page-level append for genuinely new line ids only).
 */

function lineItemIdKey(id: unknown): string {
  return String(id ?? "").trim()
}

/** JSON deep clone for billing month graphs (used for reset sources, not hot paths). */
export function deepCloneBillingMonthsState<T>(x: T): T {
  return JSON.parse(JSON.stringify(x))
}

/**
 * Full replace of `workingBillingMonths` from auto aggregates + `attachLineItemsToMonths`. Edit Billing “reset to auto” only;
 * does not touch `savedBillingMonths` until the user saves the plan.
 */
export function buildWorkingMonthsFromAutoReference(
  autoAggregateMonths: BillingMonth[],
  attachLineItemsToMonths: (months: BillingMonth[], mode: "billing" | "delivery") => BillingMonth[]
): BillingMonth[] {
  if (!autoAggregateMonths.length) return []
  const withLineItems = attachLineItemsToMonths(
    deepCloneBillingMonthsState(autoAggregateMonths),
    "billing"
  )
  return deepCloneBillingMonthsState(withLineItems)
}

/**
 * Manual modal: copy fee / tech fee / production strings from **aggregate** auto months only (no line-item rebuild).
 */
export function applyCostBucketFromAutoReferenceAggregates(
  months: BillingMonth[],
  autoAggregateMonths: BillingMonth[],
  costKey: "fee" | "adServing" | "production",
  formatter: Intl.NumberFormat
): void {
  for (const month of months) {
    const autoMonth = autoAggregateMonths.find((am) => am.monthYear === month.monthYear)
    if (costKey === "fee") {
      month.feeTotal = autoMonth?.feeTotal ?? formatter.format(0)
    } else if (costKey === "adServing") {
      month.adservingTechFees = autoMonth?.adservingTechFees ?? formatter.format(0)
    } else {
      const autoVal = autoMonth?.production ?? formatter.format(0)
      month.production = autoVal
      if (month.mediaCosts && month.mediaCosts.production !== undefined) {
        month.mediaCosts.production = autoVal
      }
    }
  }
}

function alignRecordToMonthKeys(
  source: Record<string, number> | undefined,
  monthYears: string[]
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const my of monthYears) {
    out[my] = source?.[my] ?? 0
  }
  return out
}

/**
 * Edit Billing: reset one line row from the auto template (`attachLineItemsToMonths` on auto ref). Only way to pull
 * current auto amounts for an **existing** line id without a full billing reset. Leaves fee / tech / production buckets alone.
 */
export function copySingleLineItemFromAutoTemplate(
  targetMonths: BillingMonth[],
  autoTemplateWithLineItems: BillingMonth[],
  mediaKey: string,
  lineItemId: string
): boolean {
  const monthYears = targetMonths.map((m) => m.monthYear)
  let touched = false
  for (const month of targetMonths) {
    const templateMonth = autoTemplateWithLineItems.find((am) => am.monthYear === month.monthYear)
    const tArr = templateMonth?.lineItems?.[mediaKey as keyof NonNullable<BillingMonth["lineItems"]>] as
      | BillingLineItem[]
      | undefined
    const want = lineItemIdKey(lineItemId)
    const tLi = tArr?.find((li) => lineItemIdKey(li.id) === want)
    const wArr = month.lineItems?.[mediaKey as keyof NonNullable<BillingMonth["lineItems"]>] as
      | BillingLineItem[]
      | undefined
    const wLi = wArr?.find((li) => lineItemIdKey(li.id) === want)
    if (!tLi || !wLi) continue
    touched = true
    wLi.monthlyAmounts = alignRecordToMonthKeys(tLi.monthlyAmounts, monthYears)
    wLi.totalAmount = Object.values(wLi.monthlyAmounts).reduce((s, v) => s + (v || 0), 0)
    if (tLi.feeMonthlyAmounts) {
      wLi.feeMonthlyAmounts = alignRecordToMonthKeys(tLi.feeMonthlyAmounts, monthYears)
      wLi.totalFeeAmount = tLi.totalFeeAmount
    }
    if (tLi.adServingMonthlyAmounts) {
      wLi.adServingMonthlyAmounts = alignRecordToMonthKeys(tLi.adServingMonthlyAmounts, monthYears)
      wLi.totalAdServingAmount = tLi.totalAdServingAmount
    }
    wLi.preBill = false
    wLi.preBillSnapshot = undefined
  }
  return touched
}
