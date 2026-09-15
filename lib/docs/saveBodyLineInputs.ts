/**
 * Map POST /api/plans/save line items to LineItemInput[].
 * Duplicates savePlan.toLineItemInputs — that helper stays unexported.
 */
import type {
  BillingOverride,
  FeeOverride,
  LineItemInput,
} from "@/lib/finance/campaignFinancials.types"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"

export type SaveBodyLine = {
  lineItemId: string
  mediaType: string
  buyType?: string | null
  rate: number
  enteredAmount: number
  budgetIncludesFees?: boolean | null
  clientPaysForMedia?: boolean | null
  noAdserving?: boolean | null
  feePct?: number
  bursts: unknown
  approval?: "approved" | "excluded"
  billingOverride?: BillingOverride
  feeOverride?: FeeOverride
  label?: string
}

export function saveBodyToLineItemInputs(lines: SaveBodyLine[]): LineItemInput[] {
  return lines.map((l) => ({
    lineItemId: String(l.lineItemId).trim(),
    mediaType: l.mediaType,
    buyType: l.buyType ?? "cpc",
    rate: l.rate,
    enteredAmount: l.enteredAmount,
    budgetIncludesFees: Boolean(l.budgetIncludesFees),
    clientPaysForMedia: Boolean(l.clientPaysForMedia),
    noAdserving: l.noAdserving ?? undefined,
    feePct: l.feePct,
    bursts: (Array.isArray(l.bursts) ? l.bursts : []) as LineItemInput["bursts"],
    approval: l.approval ?? "approved",
    billingOverride: l.billingOverride,
    feeOverride: l.feeOverride,
    label: l.label,
  }))
}

/** Rows for attachOverridesToLineInputs from the save body's per-line overrides. */
export function overrideRowsFromSaveLines(lines: SaveBodyLine[]): BillingOverrideRow[] {
  const rows: BillingOverrideRow[] = []
  for (const l of lines) {
    const id = String(l.lineItemId).trim()
    if (l.billingOverride?.months?.length) {
      rows.push({
        lineItemId: id,
        component: "media",
        mode: l.billingOverride.mode,
        reason: l.billingOverride.reason,
        months: l.billingOverride.months,
        dateBasis: l.billingOverride.dateBasis,
      })
    }
    if (l.feeOverride?.months?.length) {
      rows.push({
        lineItemId: id,
        component: "fee",
        mode: l.feeOverride.mode,
        reason: l.feeOverride.reason,
        months: l.feeOverride.months,
        dateBasis: l.feeOverride.dateBasis,
      })
    }
  }
  return rows
}
