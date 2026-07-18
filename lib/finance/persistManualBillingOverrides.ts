/**
 * Persist Manual Billing modal drafts → billing_overrides table
 * (replace_line / reset_line). Source of truth is the table — not billingSchedule JSON.
 */

import type { BillingMonth } from "@/lib/billing/types"
import type { BillingOverrideReason } from "@/lib/finance/campaignFinancials.types"
import {
  computeBillingOverrideDateBasis,
  type BurstDateLike,
} from "@/lib/finance/billingOverrideDateBasis"
import {
  replaceBillingOverrideLineClient,
  resetBillingOverrideLineClient,
} from "@/lib/finance/billingOverridesClient"
import {
  extractOverrideMonthsFromSchedule,
  listManualOverrideLineIds,
  toBillingOverrideLineItemId,
  validateManualMediaMonthsSum,
  type LineOverrideMeta,
  sumLineMediaAcrossMonths,
} from "@/lib/finance/manualBillingOverridesUi"

export type PersistManualBillingOverridesResult =
  | { ok: true; replacedMedia: number; replacedFee: number; reset: number }
  | { ok: false; message: string }

function reasonFromMeta(
  metaByLine: Map<string, LineOverrideMeta[]>,
  lineId: string,
  component: "media" | "fee"
): BillingOverrideReason {
  const canon = toBillingOverrideLineItemId(lineId)
  for (const [key, list] of metaByLine) {
    if (toBillingOverrideLineItemId(key) !== canon) continue
    const hit = list.find((m) => m.component === component)
    if (hit?.reason) return hit.reason
  }
  return "manual"
}

/**
 * Write current modal draft to billing_overrides.
 * - Validates media sum == line media total (from auto schedule) before replace_line(media).
 * - Fee lanes → replace_line(component=fee) with no sum gate.
 * - Lines that had table overrides but are no longer manual → reset_line.
 */
export async function persistManualBillingOverrides(args: {
  versionId: string | number
  months: BillingMonth[]
  /** Auto / booked media totals per line (pre-override). */
  autoMonthsForMediaTotals: BillingMonth[]
  metaByLine: Map<string, LineOverrideMeta[]>
  getBurstsForLine: (billingRowId: string) => BurstDateLike[]
}): Promise<PersistManualBillingOverridesResult> {
  const { versionId, months, autoMonthsForMediaTotals, metaByLine, getBurstsForLine } =
    args

  const current = listManualOverrideLineIds(months)
  const currentMedia = new Set(current.media.map(toBillingOverrideLineItemId))
  const currentFee = new Set(current.fee.map(toBillingOverrideLineItemId))

  const previousMedia = new Set<string>()
  const previousFee = new Set<string>()
  for (const [key, list] of metaByLine) {
    const canon = toBillingOverrideLineItemId(key)
    for (const m of list) {
      if (m.component === "fee") previousFee.add(canon)
      else previousMedia.add(canon)
    }
  }

  // Validate all media manuals before any writes.
  for (const billingRowId of current.media) {
    const monthsIso = extractOverrideMonthsFromSchedule(months, billingRowId, "media")
    const expected = sumLineMediaAcrossMonths(autoMonthsForMediaTotals, billingRowId)
    const gate = validateManualMediaMonthsSum(monthsIso, expected)
    if (!gate.ok) {
      return {
        ok: false,
        message: `${gate.message} (line ${toBillingOverrideLineItemId(billingRowId)})`,
      }
    }
  }

  let replacedMedia = 0
  let replacedFee = 0
  let reset = 0

  for (const billingRowId of current.media) {
    const lineItemId = toBillingOverrideLineItemId(billingRowId)
    const dateBasis = await computeBillingOverrideDateBasis(getBurstsForLine(billingRowId))
    await replaceBillingOverrideLineClient({
      media_plan_version_id: versionId,
      line_item_id: lineItemId,
      component: "media",
      mode: "manual",
      reason: reasonFromMeta(metaByLine, billingRowId, "media"),
      months: extractOverrideMonthsFromSchedule(months, billingRowId, "media"),
      date_basis: dateBasis,
    })
    replacedMedia += 1
  }

  for (const billingRowId of current.fee) {
    const lineItemId = toBillingOverrideLineItemId(billingRowId)
    const dateBasis = await computeBillingOverrideDateBasis(getBurstsForLine(billingRowId))
    await replaceBillingOverrideLineClient({
      media_plan_version_id: versionId,
      line_item_id: lineItemId,
      component: "fee",
      mode: "manual",
      reason: reasonFromMeta(metaByLine, billingRowId, "fee"),
      months: extractOverrideMonthsFromSchedule(months, billingRowId, "fee"),
      date_basis: dateBasis,
    })
    replacedFee += 1
  }

  for (const canon of previousMedia) {
    if (currentMedia.has(canon)) continue
    await resetBillingOverrideLineClient({
      media_plan_version_id: versionId,
      line_item_id: canon,
      component: "media",
    })
    reset += 1
  }
  for (const canon of previousFee) {
    if (currentFee.has(canon)) continue
    await resetBillingOverrideLineClient({
      media_plan_version_id: versionId,
      line_item_id: canon,
      component: "fee",
    })
    reset += 1
  }

  return { ok: true, replacedMedia, replacedFee, reset }
}
