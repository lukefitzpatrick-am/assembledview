/**
 * MB-20 — named client carrier for unsaved manual billing timing the user has
 * Applied but not yet saved with the campaign (Apply still persists overrides
 * until MB-23 removes that write).
 *
 * Precedence for modal / panel override rows (one place):
 *   pending (unsaved) > table (saved billing_overrides) > computed auto
 *
 * Derivation of pending rows uses existing `layerDraftMonthsOntoOverrideRows`
 * only — do not add a second draft→rows path.
 */

import type { BillingMonth } from "@/lib/billing/types"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import {
  removeOptimisticFeeOverrideRow,
  removeOptimisticMediaOverrideRow,
  toBillingOverrideLineItemId,
  type LineOverrideMeta,
} from "@/lib/finance/manualBillingOverridesUi"
import { layerDraftMonthsOntoOverrideRows } from "@/lib/finance/resolveMbaBillingModalState"

/**
 * Authoritative client statement of "manual timing the user has accepted but
 * not yet campaign-saved". Built from the open draft via the existing layerer.
 */
export function buildPendingBillingOverrideRows(
  draftMonths: BillingMonth[],
  metaByLine?: Map<string, LineOverrideMeta[]>
): BillingOverrideRow[] {
  return layerDraftMonthsOntoOverrideRows([], draftMonths, metaByLine)
}

/**
 * Precedence: pending (unsaved) > table (saved) > computed auto.
 * Non-empty pending wins; otherwise fall through to DB/optimistic table rows.
 */
export function resolveBillingOverrideRowsForModal(
  pendingBillingOverrideRows: BillingOverrideRow[] | null | undefined,
  billingOverrideRowsForPanels: BillingOverrideRow[]
): BillingOverrideRow[] {
  if (pendingBillingOverrideRows && pendingBillingOverrideRows.length > 0) {
    return pendingBillingOverrideRows
  }
  return billingOverrideRowsForPanels ?? []
}

/** Drop a line from the pending carrier (Reset to auto) so pending and table agree. */
export function removeLineFromPendingBillingOverrideRows(
  pending: BillingOverrideRow[],
  lineItemId: string
): BillingOverrideRow[] {
  return removeOptimisticFeeOverrideRow(
    removeOptimisticMediaOverrideRow(pending, lineItemId),
    lineItemId
  )
}

/**
 * MB-22 — full intended override set for the save payload.
 * Pending rows replace every saved row for the same line id (media + fee);
 * lines only present in saved keep their saved rows. Empty pending → saved.
 */
export function mergePendingOverSavedOverrideRows(
  pending: BillingOverrideRow[] | null | undefined,
  saved: BillingOverrideRow[] | null | undefined
): BillingOverrideRow[] {
  const savedRows = saved ?? []
  const pendingRows = pending ?? []
  if (pendingRows.length === 0) return [...savedRows]

  const pendingLineIds = new Set<string>()
  for (const row of pendingRows) {
    const id = toBillingOverrideLineItemId(
      String(row.line_item_id ?? row.lineItemId ?? "")
    )
    if (id) pendingLineIds.add(id)
  }

  const kept = savedRows.filter((row) => {
    const id = toBillingOverrideLineItemId(
      String(row.line_item_id ?? row.lineItemId ?? "")
    )
    return Boolean(id) && !pendingLineIds.has(id)
  })
  return [...kept, ...pendingRows]
}

/** Snapshot reason / date_basis meta alongside pending rows. */
export function cloneLineOverrideMetaMap(
  meta: Map<string, LineOverrideMeta[]>
): Map<string, LineOverrideMeta[]> {
  const next = new Map<string, LineOverrideMeta[]>()
  for (const [key, list] of meta) {
    next.set(
      key,
      list.map((m) => ({ ...m }))
    )
  }
  return next
}
