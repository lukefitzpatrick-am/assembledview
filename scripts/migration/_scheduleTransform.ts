/**
 * Explode media_plan_versions billingSchedule / deliverySchedule blobs
 * into schedule_months rows — reuses finance/billing parsers (no fork).
 */
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import {
  normalizeBillingScheduleToArray,
  parsePersistedBillingScheduleToMonths,
} from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import { normalizeMonthKey } from "@/lib/finance/accrual"
import { parseMoneyStrict, toCents } from "./_shared"

export type ScheduleBasis = "billing" | "delivery"
export type ScheduleComponent = "media" | "fee"

export type ScheduleMonthInsert = {
  versionId: number
  lineItemId: string
  component: ScheduleComponent
  basis: ScheduleBasis
  month: string // YYYY-MM-01
  amountCents: number
  source: "computed"
}

export type ScheduleExplodeResult = {
  rows: ScheduleMonthInsert[]
  failureReason: string | null
}

function monthToDate(monthKey: string): string | null {
  // monthKey is YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null
  return `${monthKey}-01`
}

function amountFromLineForMonth(li: BillingLineItem, monthYear: string): number | null {
  if (li.monthlyAmounts && monthYear in li.monthlyAmounts) {
    const v = li.monthlyAmounts[monthYear]
    if (typeof v === "number" && Number.isFinite(v)) return v
    return parseMoneyStrict(v)
  }
  if (typeof li.mediaAmount === "number" && Number.isFinite(li.mediaAmount)) {
    return li.mediaAmount
  }
  if (typeof li.totalAmount === "number" && Number.isFinite(li.totalAmount)) {
    return li.totalAmount
  }
  return null
}

function feeFromLineForMonth(li: BillingLineItem, monthYear: string): number | null {
  if (li.feeMonthlyAmounts && monthYear in li.feeMonthlyAmounts) {
    const v = li.feeMonthlyAmounts[monthYear]
    if (typeof v === "number" && Number.isFinite(v)) return v
    return parseMoneyStrict(v)
  }
  // Only attribute feeAmount to this month when monthlyAmounts says this is the active month
  // or when there is a single-month schedule — otherwise skip (avoid double-count).
  if (typeof li.feeAmount === "number" && Number.isFinite(li.feeAmount)) {
    if (li.monthlyAmounts && monthYear in li.monthlyAmounts) return li.feeAmount
  }
  return null
}

function addRow(
  acc: Map<string, ScheduleMonthInsert>,
  row: ScheduleMonthInsert
): void {
  const key = [
    row.versionId,
    row.lineItemId,
    row.component,
    row.basis,
    row.month,
  ].join("|")
  const existing = acc.get(key)
  if (existing) {
    existing.amountCents += row.amountCents
  } else {
    acc.set(key, { ...row })
  }
}

/**
 * Convert a persisted schedule blob into schedule_months inserts.
 * Empty/null blob → empty rows (not a failure).
 * Non-empty but unparseable → failureReason set, rows empty.
 */
export function explodeScheduleToMonthRows(
  versionId: number,
  basis: ScheduleBasis,
  raw: unknown
): ScheduleExplodeResult {
  // Empty object `{}` / `{ months: [] }` are no-delivery sentinels in legacy
  // Xano blobs (curatif002 v1/v2, malay001 v2) — not parse failures, not $0.
  const isEmptyObject =
    raw != null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    (Object.keys(raw as object).length === 0 ||
      (Array.isArray((raw as { months?: unknown }).months) &&
        (raw as { months: unknown[] }).months.length === 0 &&
        Object.keys(raw as object).every((k) => k === "months")))

  const isEmpty =
    raw == null ||
    raw === "" ||
    (typeof raw === "string" && !raw.trim()) ||
    (Array.isArray(raw) && raw.length === 0) ||
    isEmptyObject

  if (isEmpty) return { rows: [], failureReason: null }

  const normalized = normalizeBillingScheduleToArray(raw)
  if (!normalized) {
    return {
      rows: [],
      failureReason: `${basis}: normalizeBillingScheduleToArray failed on non-empty blob`,
    }
  }

  let months: BillingMonth[] | null
  try {
    months = parsePersistedBillingScheduleToMonths(raw)
  } catch (err) {
    return {
      rows: [],
      failureReason: `${basis}: parsePersistedBillingScheduleToMonths threw: ${
        err instanceof Error ? err.message : String(err)
      }`,
    }
  }

  if (!months || months.length === 0) {
    return {
      rows: [],
      failureReason: `${basis}: parser returned null/empty for non-empty blob`,
    }
  }

  const acc = new Map<string, ScheduleMonthInsert>()

  for (const month of months) {
    const monthYear = String(month.monthYear ?? "").trim()
    if (!monthYear) {
      return {
        rows: [],
        failureReason: `${basis}: missing monthYear on a month entry`,
      }
    }
    const monthKey = normalizeMonthKey(monthYear)
    if (!monthKey) {
      return {
        rows: [],
        failureReason: `${basis}: normalizeMonthKey failed for "${monthYear}"`,
      }
    }
    const monthDate = monthToDate(monthKey)
    if (!monthDate) {
      return {
        rows: [],
        failureReason: `${basis}: bad month key "${monthKey}"`,
      }
    }

    const lineItems = month.lineItems
    let hadLineItems = false

    if (lineItems && typeof lineItems === "object") {
      for (const [, items] of Object.entries(lineItems)) {
        if (!Array.isArray(items)) continue
        for (const li of items as BillingLineItem[]) {
          hadLineItems = true
          const lineItemId = String(li.id ?? "").trim()
          if (!lineItemId) {
            return {
              rows: [],
              failureReason: `${basis}: line item missing id in ${monthYear}`,
            }
          }

          const mediaAmt = amountFromLineForMonth(li, monthYear)
          if (mediaAmt == null && li.monthlyAmounts && monthYear in li.monthlyAmounts) {
            return {
              rows: [],
              failureReason: `${basis}: unparseable media amount for ${lineItemId} @ ${monthYear}`,
            }
          }
          if (mediaAmt != null && mediaAmt !== 0) {
            addRow(acc, {
              versionId,
              lineItemId,
              component: "media",
              basis,
              month: monthDate,
              amountCents: toCents(mediaAmt),
              source: "computed",
            })
          }

          const feeAmt = feeFromLineForMonth(li, monthYear)
          if (feeAmt != null && feeAmt !== 0) {
            addRow(acc, {
              versionId,
              lineItemId,
              component: "fee",
              basis,
              month: monthDate,
              amountCents: toCents(feeAmt),
              source: "computed",
            })
          }
        }
      }
    }

    // Month-level service buckets (synthetic line ids) when present.
    const services: Array<{ id: string; component: ScheduleComponent; raw: unknown }> = [
      {
        id: "__service__adserving",
        component: "fee",
        raw: month.adservingTechFees,
      },
      {
        id: "__service__production",
        component: "media",
        raw: month.production,
      },
    ]

    // Only emit top-level feeTotal as synthetic when there were no per-line fees.
    if (!hadLineItems) {
      services.push({
        id: "__service__fees",
        component: "fee",
        raw: month.feeTotal,
      })
      const mediaTotal = parseMoneyStrict(month.mediaTotal)
      if (mediaTotal != null && mediaTotal !== 0) {
        addRow(acc, {
          versionId,
          lineItemId: "__service__media_total",
          component: "media",
          basis,
          month: monthDate,
          amountCents: toCents(mediaTotal),
          source: "computed",
        })
      }
    }

    for (const svc of services) {
      if (svc.raw == null || svc.raw === "") continue
      const amt = parseMoneyStrict(svc.raw)
      if (amt == null) {
        return {
          rows: [],
          failureReason: `${basis}: unparseable ${svc.id} amount "${String(svc.raw)}" @ ${monthYear}`,
        }
      }
      if (amt === 0) continue
      addRow(acc, {
        versionId,
        lineItemId: svc.id,
        component: svc.component,
        basis,
        month: monthDate,
        amountCents: toCents(amt),
        source: "computed",
      })
    }
  }

  return { rows: [...acc.values()], failureReason: null }
}

export function sumScheduleCents(
  rows: ScheduleMonthInsert[],
  component?: ScheduleComponent,
  basis?: ScheduleBasis
): number {
  let s = 0
  for (const r of rows) {
    if (component && r.component !== component) continue
    if (basis && r.basis !== basis) continue
    s += r.amountCents
  }
  return s
}
