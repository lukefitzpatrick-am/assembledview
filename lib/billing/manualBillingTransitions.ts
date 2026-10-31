/**
 * Manual billing transitions shared by the twin media plan editors (B2a, 1 Nov
 * 2026). Edit was the reference (decision D5); these are its Apply and line
 * reset steps lifted out so create runs the same code. The full twin merge is
 * P6 in the code efficiency review; until then each page keeps its own state
 * and calls these.
 *
 * - `commitManualBillingDraft` is Apply (M1, MB-23): the typed timing becomes
 *   the pending override rows the campaign save sends (MB-22 REPLACE-SET).
 * - `resetLineToAutoTemplate` is the single-line reset (M4): media AND fee
 *   timing come back from the current auto template and the fee lane returns
 *   to auto.
 */

import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { applyBillingLineMode } from "@/lib/billing/applyBillingLineMode"
import { copySingleLineItemFromAutoTemplate } from "@/lib/billing/resetFromAutoReference"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import {
  billingOverrideLineIdsMatch,
  type LineOverrideMeta,
} from "@/lib/finance/manualBillingOverridesUi"
import {
  buildPendingBillingOverrideRows,
  cloneLineOverrideMetaMap,
} from "@/lib/finance/pendingBillingOverrides"

export type CommittedManualBilling = {
  /** Deep copy of the draft months at Apply: the applied schedule. */
  appliedMonths: BillingMonth[]
  /** Override rows the campaign save sends for the typed and prebilled lines. */
  pendingRows: BillingOverrideRow[]
  /** Reason and date-basis meta as it stood at Apply (restored on Cancel). */
  metaSnapshot: Map<string, LineOverrideMeta[]>
}

/** Apply: promote the open draft to the pending carrier. Pure; inputs are not mutated. */
export function commitManualBillingDraft(
  draftMonths: BillingMonth[],
  metaByLine: Map<string, LineOverrideMeta[]>
): CommittedManualBilling {
  const appliedMonths = JSON.parse(JSON.stringify(draftMonths)) as BillingMonth[]
  const pendingRows = buildPendingBillingOverrideRows(appliedMonths, metaByLine)
  return {
    appliedMonths,
    pendingRows,
    metaSnapshot: cloneLineOverrideMetaMap(metaByLine),
  }
}

/**
 * Reset one line to auto inside `targetMonths` (already a copy owned by the
 * caller; it is mutated). Copies media, fee and ad serving months from the auto
 * template, marks the line auto, sets its fee lane back to auto and refreshes
 * the media-type month totals that exist on the month. Returns the months, or
 * null when the line is not on the template (the caller tells the user).
 * Grand totals stay with the caller's own recalculation.
 */
export function resetLineToAutoTemplate(
  targetMonths: BillingMonth[],
  autoTemplateWithLineItems: BillingMonth[],
  mediaKey: string,
  lineItemId: string,
  formatter: Intl.NumberFormat
): BillingMonth[] | null {
  const ok = copySingleLineItemFromAutoTemplate(
    targetMonths,
    autoTemplateWithLineItems,
    mediaKey,
    lineItemId
  )
  if (!ok) return null

  const withAutoMode = applyBillingLineMode(targetMonths, lineItemId, "auto")
  for (const month of withAutoMode) {
    if (!month.lineItems) continue
    for (const items of Object.values(month.lineItems)) {
      if (!Array.isArray(items)) continue
      for (const line of items) {
        if (billingOverrideLineIdsMatch(String(line.id ?? ""), lineItemId)) {
          line.feeBillingMode = "auto"
        }
      }
    }
  }
  withAutoMode.forEach((month) => {
    const monthLineItems = month?.lineItems?.[mediaKey as keyof typeof month.lineItems] as
      | BillingLineItem[]
      | undefined
    if (!monthLineItems) return
    const mediaTypeTotal = monthLineItems.reduce(
      (sum, li) => sum + (li.monthlyAmounts?.[month.monthYear] || 0),
      0
    )
    if (month.mediaCosts && mediaKey in month.mediaCosts) {
      ;(month.mediaCosts as Record<string, string>)[mediaKey] = formatter.format(mediaTypeTotal)
    }
  })
  return withAutoMode
}
