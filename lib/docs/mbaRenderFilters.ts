/**
 * MBA PDF render filters — live Partial MBA overlay on persisted schedule_months.
 * Selection keys only (months + line ids). Never accepts client money totals.
 */

import { scheduleMonthYearToIso } from "@/lib/finance/computeCampaignFinancials"
import {
  buildCanonicalBillingLineIdSet,
  canonicalBillingLineIdSetHas,
} from "@/lib/finance/manualBillingOverridesUi"
import { mediaTypeFromScheduleLineId } from "@/lib/finance/scheduleMonthsSource"
import type { ScheduleMonthRowInput } from "@/lib/finance/scheduleMonthsSource"

export type LiveMbaSelection = {
  selectedMonthYears?: readonly string[]
  approvedLineItemIds?: readonly string[]
}

export type MbaRenderFilters = {
  /** Canonical (bare) line ids. */
  approvedIds: Set<string>
  /** ISO `YYYY-MM` keys. Null = no month filter. */
  approvedMonths: Set<string> | null
  /**
   * When true, empty `approvedIds` means no lines (explicit live empty).
   * When false, empty `approvedIds` means no id filter (legacy slice behaviour).
   */
  restrictLineIds: boolean
  liveOverlay: boolean
}

/** ISO `YYYY-MM` from schedule labels (`August 2026`) or dates (`2026-08-01`). */
export function renderMonthKey(month: string): string {
  const raw = String(month ?? "").trim()
  if (!raw) return raw
  const iso = scheduleMonthYearToIso(raw)
  if (/^\d{4}-\d{2}/.test(iso)) return iso.slice(0, 7)
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7)
  return raw
}

export function monthSetFromLabels(months: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (const m of months) {
    const k = renderMonthKey(m)
    if (k) out.add(k)
  }
  return out
}

function frozenMonthSet(
  lines: ReadonlyArray<{ months?: readonly string[] }>
): Set<string> {
  const months = new Set<string>()
  for (const line of lines) {
    for (const m of line.months ?? []) {
      const k = renderMonthKey(m)
      if (k) months.add(k)
    }
  }
  return months
}

export function resolveMbaRenderFilters(args: {
  frozenSlice: { lines?: Array<{ lineItemId: string; months?: string[] }> }
  liveSelection?: LiveMbaSelection | null
}): MbaRenderFilters {
  const live = args.liveSelection
  const hasLiveMonths =
    live != null &&
    Array.isArray(live.selectedMonthYears) &&
    live.selectedMonthYears.length > 0
  const hasLiveIds = live != null && Array.isArray(live.approvedLineItemIds)
  const liveOverlay = hasLiveMonths || hasLiveIds

  const frozenLines = args.frozenSlice.lines ?? []
  const frozenIds = buildCanonicalBillingLineIdSet(
    frozenLines.map((l) => l.lineItemId)
  )
  const frozenMonths = frozenMonthSet(frozenLines)

  let approvedMonths: Set<string> | null =
    frozenMonths.size > 0 ? frozenMonths : null
  if (hasLiveMonths) {
    approvedMonths = monthSetFromLabels(live!.selectedMonthYears ?? [])
  }

  let approvedIds = frozenIds
  let restrictLineIds = false
  if (hasLiveIds) {
    approvedIds = buildCanonicalBillingLineIdSet(live!.approvedLineItemIds ?? [])
    restrictLineIds = true
  }

  return { approvedIds, approvedMonths, restrictLineIds, liveOverlay }
}

export function rowInApprovedSlice(
  r: { lineItemId: string; month: string },
  approvedIds: Set<string>,
  approvedMonths: Set<string> | null,
  restrictLineIds = false
): boolean {
  const mk = renderMonthKey(r.month)
  if (approvedMonths && !approvedMonths.has(mk)) return false
  if (r.lineItemId.startsWith("__service__")) return true
  if (restrictLineIds) {
    return canonicalBillingLineIdSetHas(approvedIds, r.lineItemId)
  }
  if (
    approvedIds.size > 0 &&
    !canonicalBillingLineIdSetHas(approvedIds, r.lineItemId)
  ) {
    return false
  }
  return true
}

export type BillingComponentCents = {
  mediaCents: number
  feeCents: number
  adservingCents: number
  productionCents: number
}

/** Billing-basis component sums for live-overlay MBA totals. */
export function sumBillingComponentsFromRows(
  rows: ScheduleMonthRowInput[],
  filters: Pick<
    MbaRenderFilters,
    "approvedIds" | "approvedMonths" | "restrictLineIds"
  >
): BillingComponentCents {
  let mediaCents = 0
  let feeCents = 0
  let adservingCents = 0
  let productionCents = 0
  for (const r of rows) {
    if (r.basis !== "billing") continue
    if (
      !rowInApprovedSlice(
        r,
        filters.approvedIds,
        filters.approvedMonths,
        filters.restrictLineIds
      )
    ) {
      continue
    }
    const amt = Number(r.amountCents) || 0
    if (r.component === "fee") {
      feeCents += amt
    } else if (r.component === "adserving") {
      adservingCents += amt
    } else if (r.component === "media") {
      if (r.lineItemId.startsWith("__service__")) continue
      if (mediaTypeFromScheduleLineId(r.lineItemId) === "production") {
        productionCents += amt
      } else {
        mediaCents += amt
      }
    }
  }
  return { mediaCents, feeCents, adservingCents, productionCents }
}
