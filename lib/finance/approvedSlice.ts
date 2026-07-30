/**
 * PC2 — approved billing slice (the billing law at publish/approve).
 *
 * Slice = (approved lines from mba_line_approvals / line.approval) ×
 * (selected month chips) with production + campaign-cost (adserving) first-class.
 * Persisted as media_plan_versions.approved_slice; never mutated after write.
 */

import type { BillingMonth, BillingLineItem } from "@/lib/billing/types"
import type { CampaignFinancials } from "@/lib/finance/campaignFinancials.types"
import { scheduleMonthYearToIso } from "@/lib/finance/computeCampaignFinancials"
import { roundMoney2 } from "@/lib/format/money"
import { toCents } from "@/scripts/migration/_shared"

export type ApprovedSliceLine = {
  lineItemId: string
  /** ISO months included (YYYY-MM). */
  months: string[]
  mediaCents: number
  feeCents: number
  adservingCents: number
  productionCents: number
}

export type ApprovedSlice = {
  totalCents: number
  lines: ApprovedSliceLine[]
}

export type ComputeApprovedSliceInput = {
  financials: CampaignFinancials
  /**
   * Month chips (`January 2026` or `2026-01`). Empty / omitted → all billing months.
   */
  selectedMonthYears?: readonly string[]
  /**
   * When provided, only these line ids are in the slice (approved ticks).
   * Empty array → empty slice. Omit → all non-excluded perLine rows.
   */
  approvedLineItemIds?: ReadonlySet<string> | readonly string[]
}

function toIsoMonth(monthYear: string): string {
  return scheduleMonthYearToIso(monthYear)
}

function monthInSelection(
  monthYear: string,
  selectedSet: Set<string> | null
): boolean {
  if (!selectedSet || selectedSet.size === 0) return true
  if (selectedSet.has(monthYear)) return true
  const iso = toIsoMonth(monthYear)
  return selectedSet.has(iso)
}

function normalizeSelectedSet(
  selectedMonthYears: readonly string[] | undefined
): Set<string> | null {
  if (!selectedMonthYears || selectedMonthYears.length === 0) return null
  return new Set(selectedMonthYears.map((m) => String(m).trim()).filter(Boolean))
}

function resolveApprovedIds(
  financials: CampaignFinancials,
  approvedLineItemIds: ComputeApprovedSliceInput["approvedLineItemIds"]
): Set<string> {
  if (approvedLineItemIds == null) {
    return new Set(
      financials.perLine
        .filter((p) => !p.flags.excluded)
        .map((p) => p.lineItemId)
    )
  }
  if (approvedLineItemIds instanceof Set) return approvedLineItemIds
  return new Set([...approvedLineItemIds].map(String))
}

function lineAmountsForMonth(
  li: BillingLineItem,
  monthYear: string
): { media: number; fee: number; adserving: number } {
  const media = roundMoney2(li.monthlyAmounts?.[monthYear] ?? 0)
  const fee = roundMoney2(li.feeMonthlyAmounts?.[monthYear] ?? 0)
  const adserving = roundMoney2(li.adServingMonthlyAmounts?.[monthYear] ?? 0)
  return { media, fee, adserving }
}

/**
 * Build the frozen approved slice from core financials + month chips + line ticks.
 * Production lines contribute productionCents (media bucket under production media type);
 * adserving is first-class on each line when present.
 */
export function computeApprovedSlice(input: ComputeApprovedSliceInput): ApprovedSlice {
  const { financials } = input
  const selectedSet = normalizeSelectedSet(input.selectedMonthYears)
  const approvedIds = resolveApprovedIds(financials, input.approvedLineItemIds)

  const byLine = new Map<
    string,
    {
      months: Set<string>
      media: number
      fee: number
      adserving: number
      production: number
    }
  >()

  const billingMonths: BillingMonth[] = financials.billingSchedule ?? []

  for (const month of billingMonths) {
    if (!monthInSelection(month.monthYear, selectedSet)) continue
    const iso = toIsoMonth(month.monthYear)
    const lineItems = month.lineItems
    if (!lineItems) continue

    for (const [mediaKey, items] of Object.entries(lineItems)) {
      if (!Array.isArray(items)) continue
      const isProduction = mediaKey === "production"
      for (const li of items as BillingLineItem[]) {
        const id = String(li.id ?? "").trim()
        if (!id || !approvedIds.has(id)) continue
        const { media, fee, adserving } = lineAmountsForMonth(li, month.monthYear)
        if (media === 0 && fee === 0 && adserving === 0) continue

        let row = byLine.get(id)
        if (!row) {
          row = {
            months: new Set(),
            media: 0,
            fee: 0,
            adserving: 0,
            production: 0,
          }
          byLine.set(id, row)
        }
        row.months.add(iso)
        if (isProduction) {
          row.production = roundMoney2(row.production + media)
        } else {
          row.media = roundMoney2(row.media + media)
        }
        row.fee = roundMoney2(row.fee + fee)
        row.adserving = roundMoney2(row.adserving + adserving)
      }
    }
  }

  const lines: ApprovedSliceLine[] = [...byLine.entries()]
    .map(([lineItemId, row]) => ({
      lineItemId,
      months: [...row.months].sort(),
      mediaCents: toCents(row.media),
      feeCents: toCents(row.fee),
      adservingCents: toCents(row.adserving),
      productionCents: toCents(row.production),
    }))
    .sort((a, b) => a.lineItemId.localeCompare(b.lineItemId))

  const totalCents = lines.reduce(
    (s, l) =>
      s + l.mediaCents + l.feeCents + l.adservingCents + l.productionCents,
    0
  )

  return { totalCents, lines }
}

/** Σ of a slice's line components (should equal totalCents). */
export function sumApprovedSliceCents(slice: ApprovedSlice): number {
  return slice.lines.reduce(
    (s, l) =>
      s + l.mediaCents + l.feeCents + l.adservingCents + l.productionCents,
    0
  )
}
