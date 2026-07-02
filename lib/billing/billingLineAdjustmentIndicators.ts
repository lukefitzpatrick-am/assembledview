import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

export const BILLING_AMOUNT_DIVERGENCE_TOLERANCE = 0.01

export type BillingCellAdjustmentKind = "manual" | "divergent"

export type BillingLineAdjustmentMaps = Readonly<{
  manualLineIds: ReadonlySet<string>
  divergentCells: ReadonlySet<string>
}>

export const MANUAL_BILLING_ADJUSTMENT_TOOLTIP =
  "Manually adjusted — not derived from line item totals"

export const DIVERGENT_BILLING_CELL_TOOLTIP = "Differs from calculated total"

function billingCellKey(lineItemId: string, monthYear: string): string {
  return `${lineItemId}::${monthYear}`
}

function exceedsTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) > BILLING_AMOUNT_DIVERGENCE_TOLERANCE
}

function collectLinesById(months: BillingMonth[]): Map<string, BillingLineItem> {
  const map = new Map<string, BillingLineItem>()
  for (const month of months) {
    const lineItems = month.lineItems
    if (!lineItems) continue
    for (const items of Object.values(lineItems)) {
      const arr = items as BillingLineItem[] | undefined
      if (!arr?.length) continue
      for (const line of arr) {
        if (!line.id) continue
        map.set(line.id, line)
      }
    }
  }
  return map
}

/**
 * Builds lookup sets for manual-billing visual indicators.
 *
 * - `manualLineIds`: lines with persisted `billingMode: "manual"` (authoritative intent).
 * - `divergentCells`: per-month cells where the working amount differs from auto reference
 *   while the line is not explicitly manual (auto or legacy undefined mode).
 */
export function buildBillingLineAdjustmentMaps(
  workingMonths: BillingMonth[],
  autoReferenceMonths?: BillingMonth[]
): BillingLineAdjustmentMaps {
  const manualLineIds = new Set<string>()
  const divergentCells = new Set<string>()

  const workingLines = collectLinesById(workingMonths)
  for (const [lineItemId, line] of workingLines) {
    if (line.billingMode === "manual") {
      manualLineIds.add(lineItemId)
    }
  }

  if (!autoReferenceMonths?.length) {
    return { manualLineIds, divergentCells }
  }

  const autoLines = collectLinesById(autoReferenceMonths)
  const monthYears = new Set<string>([
    ...workingMonths.map((m) => m.monthYear),
    ...autoReferenceMonths.map((m) => m.monthYear),
  ])

  for (const [lineItemId, workingLine] of workingLines) {
    if (workingLine.billingMode === "manual") continue

    const autoLine = autoLines.get(lineItemId)
    for (const monthYear of monthYears) {
      const workingAmount = workingLine.monthlyAmounts?.[monthYear] ?? 0
      const autoAmount = autoLine?.monthlyAmounts?.[monthYear] ?? 0
      if (exceedsTolerance(workingAmount, autoAmount)) {
        divergentCells.add(billingCellKey(lineItemId, monthYear))
      }
    }
  }

  return { manualLineIds, divergentCells }
}

export function getBillingCellAdjustmentKind(
  maps: BillingLineAdjustmentMaps,
  lineItemId: string,
  monthYear: string
): BillingCellAdjustmentKind | null {
  if (maps.manualLineIds.has(lineItemId)) return "manual"
  if (maps.divergentCells.has(billingCellKey(lineItemId, monthYear))) return "divergent"
  return null
}
