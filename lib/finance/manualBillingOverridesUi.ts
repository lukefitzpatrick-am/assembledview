/**
 * Pure helpers: overlay `billing_overrides` onto Manual Billing months, extract
 * replace_line payloads, and enforce media timing-only sum rules.
 */

import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { syncLineItemMonthlyAmountAcrossAllMonthRows } from "@/lib/billing/syncLineItemAmountAcrossMonthRows"
import {
  isoMonthToScheduleMonthYear,
  scheduleMonthYearToIso,
} from "@/lib/finance/computeCampaignFinancials"
import type {
  BillingOverrideReason,
  MonthAmount,
} from "@/lib/finance/campaignFinancials.types"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import {
  billingOverrideFromRow,
  feeOverrideFromRow,
} from "@/lib/finance/billingOverrides"
import { roundMoney2 } from "@/lib/format/money"

export const MANUAL_MEDIA_SUM_TOLERANCE = 0.01

export type LineOverrideMeta = {
  mode: "auto" | "manual"
  reason?: BillingOverrideReason
  dateBasis: string
  component: "media" | "fee"
}

function rowLineId(row: BillingOverrideRow): string {
  return String(row.line_item_id ?? row.lineItemId ?? "").trim()
}

function rowComponent(row: BillingOverrideRow): "media" | "fee" {
  return String(row.component ?? "media").trim().toLowerCase() === "fee" ? "fee" : "media"
}

/**
 * Canonical id for `billing_overrides.line_item_id`.
 * Strips the UI wrapper `billing-{mediaType}::{raw}` back to `{raw}`.
 */
export function toBillingOverrideLineItemId(billingRowId: string): string {
  const s = String(billingRowId ?? "").trim()
  const m = /^billing-[^:]+::(.+)$/.exec(s)
  return m?.[1] ? m[1].trim() : s
}

/** Match schedule row ids to override row ids (raw or billing-prefixed). */
export function billingOverrideLineIdsMatch(a: string, b: string): boolean {
  const left = String(a ?? "").trim()
  const right = String(b ?? "").trim()
  if (!left || !right) return false
  if (left === right) return true
  return toBillingOverrideLineItemId(left) === toBillingOverrideLineItemId(right)
}

/** Walk schedule months and collect unique line items by id. */
export function collectScheduleLinesById(
  months: BillingMonth[]
): Map<string, { mediaKey: string; line: BillingLineItem }> {
  const map = new Map<string, { mediaKey: string; line: BillingLineItem }>()
  for (const month of months) {
    const lineItems = month.lineItems
    if (!lineItems) continue
    for (const [mediaKey, items] of Object.entries(lineItems)) {
      if (!Array.isArray(items)) continue
      for (const line of items) {
        const id = String(line.id ?? "").trim()
        if (!id || map.has(id)) continue
        map.set(id, { mediaKey, line })
      }
    }
  }
  return map
}

/** Sum a line's media monthlyAmounts across the schedule. */
export function sumLineMediaAcrossMonths(months: BillingMonth[], lineItemId: string): number {
  const id = String(lineItemId).trim()
  let sum = 0
  for (const month of months) {
    const lineItems = month.lineItems
    if (!lineItems) continue
    for (const items of Object.values(lineItems)) {
      if (!Array.isArray(items)) continue
      for (const line of items) {
        if (!billingOverrideLineIdsMatch(String(line.id ?? ""), id)) continue
        sum += Number(line.monthlyAmounts?.[month.monthYear] ?? 0) || 0
      }
    }
  }
  return roundMoney2(sum)
}

/** Sum a line's feeMonthlyAmounts across the schedule. */
export function sumLineFeeAcrossMonths(months: BillingMonth[], lineItemId: string): number {
  const id = String(lineItemId).trim()
  let sum = 0
  for (const month of months) {
    const lineItems = month.lineItems
    if (!lineItems) continue
    for (const items of Object.values(lineItems)) {
      if (!Array.isArray(items)) continue
      for (const line of items) {
        if (!billingOverrideLineIdsMatch(String(line.id ?? ""), id)) continue
        sum += Number(line.feeMonthlyAmounts?.[month.monthYear] ?? 0) || 0
      }
    }
  }
  return roundMoney2(sum)
}

/**
 * Extract ISO month amounts for replace_line from the modal schedule.
 * `component: 'media'` → monthlyAmounts; `component: 'fee'` → feeMonthlyAmounts.
 */
export function extractOverrideMonthsFromSchedule(
  months: BillingMonth[],
  lineItemId: string,
  component: "media" | "fee"
): MonthAmount[] {
  const id = String(lineItemId).trim()
  const byIso = new Map<string, number>()

  for (const month of months) {
    const lineItems = month.lineItems
    if (!lineItems) continue
    for (const items of Object.values(lineItems)) {
      if (!Array.isArray(items)) continue
      for (const line of items) {
        if (!billingOverrideLineIdsMatch(String(line.id ?? ""), id)) continue
        const amt =
          component === "fee"
            ? Number(line.feeMonthlyAmounts?.[month.monthYear] ?? 0) || 0
            : Number(line.monthlyAmounts?.[month.monthYear] ?? 0) || 0
        const iso = scheduleMonthYearToIso(month.monthYear)
        byIso.set(iso, roundMoney2((byIso.get(iso) ?? 0) + amt))
      }
    }
  }

  return [...byIso.entries()]
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * Timing-only gate: manual media months must sum to the line's media total (±$0.01).
 * `expectedMediaTotal` is the AUTO / booked line media (before override retiming).
 */
export function validateManualMediaMonthsSum(
  months: MonthAmount[],
  expectedMediaTotal: number
): { ok: true } | { ok: false; message: string; actual: number; expected: number; delta: number } {
  const actual = roundMoney2(months.reduce((s, m) => s + (Number(m.amount) || 0), 0))
  const expected = roundMoney2(expectedMediaTotal)
  const delta = roundMoney2(actual - expected)
  if (Math.abs(delta) <= MANUAL_MEDIA_SUM_TOLERANCE) return { ok: true }
  return {
    ok: false,
    actual,
    expected,
    delta,
    message: `Manual billing months must sum to the line media total (timing only). Got ${actual.toFixed(2)}, expected ${expected.toFixed(2)} (Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}).`,
  }
}

/**
 * Apply table override rows onto a BillingMonth[] draft for the Manual Billing modal.
 * Preserves mode / reason / dateBasis on each line (UI reads billingMode / feeBillingMode;
 * meta is returned separately for callers that need reason/dateBasis).
 */
export function applyBillingOverrideRowsToMonths(
  months: BillingMonth[],
  rows: BillingOverrideRow[]
): { months: BillingMonth[]; metaByLine: Map<string, LineOverrideMeta[]> } {
  const next = months.map((m) => ({
    ...m,
    mediaCosts: m.mediaCosts ? { ...m.mediaCosts } : m.mediaCosts,
    lineItems: m.lineItems
      ? Object.fromEntries(
          Object.entries(m.lineItems).map(([k, items]) => [
            k,
            (items ?? []).map((li) => ({
              ...li,
              monthlyAmounts: { ...(li.monthlyAmounts ?? {}) },
              feeMonthlyAmounts: li.feeMonthlyAmounts
                ? { ...li.feeMonthlyAmounts }
                : li.feeMonthlyAmounts,
            })),
          ])
        )
      : m.lineItems,
  })) as BillingMonth[]

  const metaByLine = new Map<string, LineOverrideMeta[]>()

  for (const row of rows) {
    const id = rowLineId(row)
    if (!id) continue
    const component = rowComponent(row)

    if (component === "fee") {
      const fee = feeOverrideFromRow(row)
      if (!fee) continue
      const list = metaByLine.get(id) ?? []
      list.push({
        mode: "manual",
        reason: fee.reason,
        dateBasis: fee.dateBasis,
        component: "fee",
      })
      metaByLine.set(id, list)

      for (const { month, amount } of fee.months) {
        const monthYear = isoMonthToScheduleMonthYear(month)
        const monthRow = next.find((m) => m.monthYear === monthYear)
        if (!monthRow?.lineItems) continue
        for (const items of Object.values(monthRow.lineItems)) {
          if (!Array.isArray(items)) continue
          for (const line of items) {
            if (!billingOverrideLineIdsMatch(String(line.id ?? ""), id)) continue
            if (!line.feeMonthlyAmounts) line.feeMonthlyAmounts = {}
            line.feeMonthlyAmounts[monthYear] = roundMoney2(amount)
            line.feeBillingMode = "manual"
            line.totalFeeAmount = undefined
          }
        }
      }
      continue
    }

    const media = billingOverrideFromRow(row)
    if (!media || media.mode !== "manual") continue
    const list = metaByLine.get(id) ?? []
    list.push({
      mode: "manual",
      reason: media.reason,
      dateBasis: media.dateBasis,
      component: "media",
    })
    metaByLine.set(id, list)

    for (const { month, amount } of media.months) {
      const monthYear = isoMonthToScheduleMonthYear(month)
      const monthRow = next.find((m) => m.monthYear === monthYear)
      if (!monthRow?.lineItems) continue
      for (const items of Object.values(monthRow.lineItems)) {
        if (!Array.isArray(items)) continue
        for (const line of items) {
          if (!billingOverrideLineIdsMatch(String(line.id ?? ""), id)) continue
          if (!line.monthlyAmounts) line.monthlyAmounts = {}
          line.monthlyAmounts[monthYear] = roundMoney2(amount)
          line.billingMode = "manual"
        }
      }
    }
  }

  // Refresh line totals after overlays.
  const lineMedia = new Map<string, number>()
  const lineFee = new Map<string, number>()
  for (const month of next) {
    if (!month.lineItems) continue
    for (const items of Object.values(month.lineItems)) {
      if (!Array.isArray(items)) continue
      for (const line of items) {
        const id = String(line.id ?? "").trim()
        if (!id) continue
        lineMedia.set(
          id,
          roundMoney2((lineMedia.get(id) ?? 0) + (Number(line.monthlyAmounts?.[month.monthYear] ?? 0) || 0))
        )
        lineFee.set(
          id,
          roundMoney2((lineFee.get(id) ?? 0) + (Number(line.feeMonthlyAmounts?.[month.monthYear] ?? 0) || 0))
        )
      }
    }
  }
  for (const month of next) {
    if (!month.lineItems) continue
    for (const items of Object.values(month.lineItems)) {
      if (!Array.isArray(items)) continue
      for (const line of items) {
        const id = String(line.id ?? "").trim()
        if (!id) continue
        if (lineMedia.has(id)) line.totalAmount = lineMedia.get(id)!
        if (lineFee.has(id)) line.totalFeeAmount = lineFee.get(id)!
      }
    }
  }

  return { months: next, metaByLine }
}

/** Lines that currently carry manual media or fee mode in the modal draft. */
export function listManualOverrideLineIds(months: BillingMonth[]): {
  media: string[]
  fee: string[]
} {
  const media = new Set<string>()
  const fee = new Set<string>()
  for (const month of months) {
    if (!month.lineItems) continue
    for (const items of Object.values(month.lineItems)) {
      if (!Array.isArray(items)) continue
      for (const line of items) {
        const id = String(line.id ?? "").trim()
        if (!id) continue
        if (line.billingMode === "manual") media.add(id)
        if (line.feeBillingMode === "manual") fee.add(id)
      }
    }
  }
  return { media: [...media], fee: [...fee] }
}

/**
 * Upsert media (or fee) override meta for persistManualBillingOverrides.
 * Keys by the first matching map entry (or the billing row id when new).
 */
export function upsertLineOverrideMeta(
  metaByLine: Map<string, LineOverrideMeta[]>,
  lineItemId: string,
  meta: LineOverrideMeta
): void {
  const canon = toBillingOverrideLineItemId(lineItemId)
  let mapKey = String(lineItemId).trim()
  for (const key of metaByLine.keys()) {
    if (toBillingOverrideLineItemId(key) === canon) {
      mapKey = key
      break
    }
  }
  const prev = metaByLine.get(mapKey) ?? []
  const next = prev.filter((m) => m.component !== meta.component)
  next.push(meta)
  metaByLine.set(mapKey, next)
}

/** Remove media/fee meta for a line (Reset to auto / clear prepayment). */
export function clearLineOverrideMeta(
  metaByLine: Map<string, LineOverrideMeta[]>,
  lineItemId: string,
  component?: "media" | "fee"
): void {
  const canon = toBillingOverrideLineItemId(lineItemId)
  for (const key of [...metaByLine.keys()]) {
    if (toBillingOverrideLineItemId(key) !== canon) continue
    if (!component) {
      metaByLine.delete(key)
      continue
    }
    const next = (metaByLine.get(key) ?? []).filter((m) => m.component !== component)
    if (next.length === 0) metaByLine.delete(key)
    else metaByLine.set(key, next)
  }
}

export function lineHasPrepaymentMeta(
  metaByLine: Map<string, LineOverrideMeta[]>,
  lineItemId: string
): boolean {
  const canon = toBillingOverrideLineItemId(lineItemId)
  for (const [key, list] of metaByLine) {
    if (toBillingOverrideLineItemId(key) !== canon) continue
    if (list.some((m) => m.component === "media" && m.reason === "prepayment")) return true
  }
  return false
}

/**
 * Full line-media in the earliest campaign/draft month, 0 elsewhere.
 * Uses the same syncLineItemMonthlyAmountAcrossAllMonthRows path as cell edits.
 */
export function applyLinePrebillToMonths(
  months: BillingMonth[],
  mediaKey: string,
  lineItemId: string,
  lineMediaTotal: number
): BillingMonth[] {
  if (!months.length) return months
  const earliest = months[0]!.monthYear
  const total = roundMoney2(lineMediaTotal)
  for (const month of months) {
    const amount = month.monthYear === earliest ? total : 0
    syncLineItemMonthlyAmountAcrossAllMonthRows(
      months,
      mediaKey,
      lineItemId,
      month.monthYear,
      amount
    )
  }
  // Stamp UI helper so Advanced Pre-bill checkbox stays in sync.
  for (const month of months) {
    if (!month.lineItems) continue
    const list = month.lineItems[mediaKey as keyof typeof month.lineItems] as
      | BillingLineItem[]
      | undefined
    if (!list) continue
    for (const line of list) {
      if (!billingOverrideLineIdsMatch(String(line.id ?? ""), lineItemId)) continue
      line.preBill = true
    }
  }
  return months
}

/** ISO month amounts for a prepayment override row (optimistic panels + replace_line). */
export function buildPrepaymentOverrideMonths(
  months: BillingMonth[],
  lineMediaTotal: number
): MonthAmount[] {
  if (!months.length) return []
  const earliest = months[0]!.monthYear
  const total = roundMoney2(lineMediaTotal)
  return months
    .map((m) => ({
      month: scheduleMonthYearToIso(m.monthYear),
      amount: m.monthYear === earliest ? total : 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

/** Merge/replace a media prepayment row for live panel financials before persist. */
export function upsertOptimisticPrepaymentOverrideRow(
  rows: BillingOverrideRow[],
  lineItemId: string,
  months: MonthAmount[],
  dateBasis = ""
): BillingOverrideRow[] {
  const canon = toBillingOverrideLineItemId(lineItemId)
  const next = rows.filter((r) => {
    if (rowComponent(r) !== "media") return true
    return toBillingOverrideLineItemId(rowLineId(r)) !== canon
  })
  next.push({
    line_item_id: canon,
    component: "media",
    mode: "manual",
    reason: "prepayment",
    months,
    date_basis: dateBasis,
  })
  return next
}

/** Drop media override rows for a line (optimistic clear on Reset). */
export function removeOptimisticMediaOverrideRow(
  rows: BillingOverrideRow[],
  lineItemId: string
): BillingOverrideRow[] {
  const canon = toBillingOverrideLineItemId(lineItemId)
  return rows.filter((r) => {
    if (rowComponent(r) !== "media") return true
    return toBillingOverrideLineItemId(rowLineId(r)) !== canon
  })
}
