/**
 * C3 helpers for applying keep/reset decisions against billing_overrides.
 */

import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import {
  replaceBillingOverrideLineClient,
  resetBillingOverrideLineClient,
} from "@/lib/finance/billingOverridesClient"
import { billingOverrideFromRow, feeOverrideFromRow } from "@/lib/finance/billingOverrides"
import type { StaleDateBasisOverride } from "@/lib/finance/preservePriorBilling"
import type { DateBasisDecision } from "@/lib/finance/preservePriorBilling"
import type { MonthAmount } from "@/lib/finance/campaignFinancials.types"

function rowMatchesStale(row: BillingOverrideRow, stale: StaleDateBasisOverride): boolean {
  const id = String(row.line_item_id ?? row.lineItemId ?? "").trim()
  const component =
    String(row.component ?? "media").trim().toLowerCase() === "fee" ? "fee" : "media"
  return id === stale.lineItemId && component === stale.component
}

/**
 * Apply keep-or-reset for stale dateBasis overrides.
 * - reset → DELETE reset_line for each
 * - keep → replace_line with same months, new currentDateBasis (avoids re-prompt)
 * - keep_shape_plus_delta → replace_line with preview months (manual + balancing source)
 */
export async function applyDateBasisKeepOrReset(args: {
  versionId: string | number
  mbaNumber: string
  decision: DateBasisDecision
  stale: StaleDateBasisOverride[]
  overrideRows: BillingOverrideRow[]
  /**
   * Required when decision is keep_shape_plus_delta — map lineItemId → new months
   * (already computed via applyKeepShapePlusDelta).
   */
  keepShapePlusDeltaMonthsByLine?: Map<string, MonthAmount[]>
}): Promise<void> {
  const { versionId, mbaNumber, decision, stale, overrideRows, keepShapePlusDeltaMonthsByLine } =
    args
  const mba = String(mbaNumber ?? "").trim()
  if (!mba) {
    throw new Error("mba_number is required for date-basis keep/reset")
  }

  if (decision === "reset") {
    for (const s of stale) {
      await resetBillingOverrideLineClient({
        media_plan_version_id: versionId,
        mba_number: mba,
        line_item_id: s.lineItemId,
        component: s.component,
      })
    }
    return
  }

  if (decision === "keep_shape_plus_delta") {
    for (const s of stale) {
      if (s.component !== "media") {
        const row = overrideRows.find((r) => rowMatchesStale(r, s))
        if (!row) continue
        const fee = feeOverrideFromRow(row)
        if (!fee) continue
        await replaceBillingOverrideLineClient({
          media_plan_version_id: versionId,
          mba_number: mba,
          line_item_id: s.lineItemId,
          component: "fee",
          mode: "manual",
          reason: fee.reason ?? s.reason ?? "manual",
          months: fee.months,
          date_basis: s.currentDateBasis,
        })
        continue
      }
      const months = keepShapePlusDeltaMonthsByLine?.get(s.lineItemId)
      if (!months?.length) continue
      const row = overrideRows.find((r) => rowMatchesStale(r, s))
      const media = row ? billingOverrideFromRow(row) : null
      await replaceBillingOverrideLineClient({
        media_plan_version_id: versionId,
        mba_number: mba,
        line_item_id: s.lineItemId,
        component: "media",
        mode: "manual",
        reason: media?.reason ?? s.reason ?? "manual",
        months,
        date_basis: s.currentDateBasis,
      })
    }
    return
  }

  // keep — rewrite date_basis to current while preserving months/reason
  for (const s of stale) {
    const row = overrideRows.find((r) => rowMatchesStale(r, s))
    if (!row) continue
    if (s.component === "fee") {
      const fee = feeOverrideFromRow(row)
      if (!fee) continue
      await replaceBillingOverrideLineClient({
        media_plan_version_id: versionId,
        mba_number: mba,
        line_item_id: s.lineItemId,
        component: "fee",
        mode: "manual",
        reason: fee.reason ?? s.reason ?? "manual",
        months: fee.months,
        date_basis: s.currentDateBasis,
      })
    } else {
      const media = billingOverrideFromRow(row)
      if (!media) continue
      await replaceBillingOverrideLineClient({
        media_plan_version_id: versionId,
        mba_number: mba,
        line_item_id: s.lineItemId,
        component: "media",
        mode: media.mode,
        reason: media.reason ?? s.reason ?? "manual",
        months: media.months,
        date_basis: s.currentDateBasis,
      })
    }
  }
}
