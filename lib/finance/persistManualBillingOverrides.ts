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
  | {
      ok: true
      replacedMedia: number
      replacedFee: number
      reset: number
      /** Canon line ids skipped because extract found no month amounts (MB-19 orphans). */
      skippedEmptyMonths: string[]
    }
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
 * MB-19 — actionable copy when override meta named lines that are absent from the draft
 * schedule (deleted lines / orphans). Leaves the DB row in place (skip, do not reset).
 */
export function manualBillingPersistSkipNotice(skippedLineIds: string[]): string | null {
  const n = skippedLineIds.length
  if (n === 0) return null
  return n === 1
    ? "1 override was skipped because that plan line is no longer present."
    : `${n} overrides were skipped because those plan lines are no longer present.`
}

/**
 * Write current modal draft to billing_overrides.
 * - Validates media sum == line media total (from auto schedule) before replace_line(media).
 * - Fee lanes → replace_line(component=fee) with no sum gate.
 * - Lines that had table overrides but are no longer manual → reset_line.
 * - MB-19: empty monthsIso skips that line (continue) — never aborts the whole save.
 */
export async function persistManualBillingOverrides(args: {
  versionId: string | number
  mbaNumber: string
  months: BillingMonth[]
  /** Auto / booked media totals per line (pre-override). */
  autoMonthsForMediaTotals: BillingMonth[]
  metaByLine: Map<string, LineOverrideMeta[]>
  getBurstsForLine: (billingRowId: string) => BurstDateLike[]
}): Promise<PersistManualBillingOverridesResult> {
  const {
    versionId,
    mbaNumber,
    months,
    autoMonthsForMediaTotals,
    metaByLine,
    getBurstsForLine,
  } = args

  const mba = String(mbaNumber ?? "").trim()
  if (!mba) {
    return { ok: false, message: "mba_number is required to persist billing overrides." }
  }

  const current = listManualOverrideLineIds(months)
  // Prefer schedule row ids (may be billing-prefixed); also accept meta keys from Prebill.
  const mediaWriteIds = new Map<string, string>() // canon → billingRowId for extract
  const feeWriteIds = new Map<string, string>()
  for (const billingRowId of current.media) {
    mediaWriteIds.set(toBillingOverrideLineItemId(billingRowId), billingRowId)
  }
  for (const billingRowId of current.fee) {
    feeWriteIds.set(toBillingOverrideLineItemId(billingRowId), billingRowId)
  }

  const previousMedia = new Set<string>()
  const previousFee = new Set<string>()
  for (const [key, list] of metaByLine) {
    const canon = toBillingOverrideLineItemId(key)
    for (const m of list) {
      if (m.component === "fee") {
        previousFee.add(canon)
        // BUX-6: Prebill stamps meta even when billingMode stamp missed (id shape mismatch).
        if (m.mode === "manual" && !feeWriteIds.has(canon)) {
          feeWriteIds.set(canon, key)
        }
      } else {
        previousMedia.add(canon)
        if (m.mode === "manual" && !mediaWriteIds.has(canon)) {
          mediaWriteIds.set(canon, key)
        }
      }
    }
  }

  const currentMedia = new Set(mediaWriteIds.keys())
  const currentFee = new Set(feeWriteIds.keys())

  // Validate all media manuals before any writes.
  for (const billingRowId of mediaWriteIds.values()) {
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
  const skippedEmptyMonths: string[] = []

  for (const [lineItemId, billingRowId] of mediaWriteIds) {
    const monthsIso = extractOverrideMonthsFromSchedule(months, billingRowId, "media")
    // MB-19: orphan / absent line — skip this row; do not abort sibling writes; leave DB row.
    if (monthsIso.length === 0) {
      skippedEmptyMonths.push(lineItemId)
      continue
    }
    const dateBasis = await computeBillingOverrideDateBasis(getBurstsForLine(billingRowId))
    await replaceBillingOverrideLineClient({
      media_plan_version_id: versionId,
      mba_number: mba,
      line_item_id: lineItemId,
      component: "media",
      mode: "manual",
      reason: reasonFromMeta(metaByLine, billingRowId, "media"),
      months: monthsIso,
      date_basis: dateBasis,
    })
    replacedMedia += 1
  }

  for (const [lineItemId, billingRowId] of feeWriteIds) {
    const monthsIso = extractOverrideMonthsFromSchedule(months, billingRowId, "fee")
    if (monthsIso.length === 0) {
      skippedEmptyMonths.push(lineItemId)
      continue
    }
    const dateBasis = await computeBillingOverrideDateBasis(getBurstsForLine(billingRowId))
    await replaceBillingOverrideLineClient({
      media_plan_version_id: versionId,
      mba_number: mba,
      line_item_id: lineItemId,
      component: "fee",
      mode: "manual",
      reason: reasonFromMeta(metaByLine, billingRowId, "fee"),
      months: monthsIso,
      date_basis: dateBasis,
    })
    replacedFee += 1
  }

  for (const canon of previousMedia) {
    if (currentMedia.has(canon)) continue
    await resetBillingOverrideLineClient({
      media_plan_version_id: versionId,
      mba_number: mba,
      line_item_id: canon,
      component: "media",
    })
    reset += 1
  }
  for (const canon of previousFee) {
    if (currentFee.has(canon)) continue
    await resetBillingOverrideLineClient({
      media_plan_version_id: versionId,
      mba_number: mba,
      line_item_id: canon,
      component: "fee",
    })
    reset += 1
  }

  return { ok: true, replacedMedia, replacedFee, reset, skippedEmptyMonths }
}
