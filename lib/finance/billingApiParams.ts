import { format, isValid, parse } from "date-fns"
import type { BillingType } from "@/lib/types/financeBilling"

/** All values allowed for `finance_billing_records.billing_type` in the API layer (must match Xano enum). */
export const BILLING_TYPE_VALUES: readonly BillingType[] = ["media", "sow", "retainer", "payable"] as const

const BILLING_TYPE_SET = new Set<string>(BILLING_TYPE_VALUES)

const YYYY_MM = /^\d{4}-(0[1-9]|1[0-2])$/

export type FinanceApiErrorBody = { error: string; field?: string }

export function parseBillingTypesQueryParam(raw: string | null): { ok: true; types: BillingType[] } | FinanceApiErrorBody {
  if (raw == null || !String(raw).trim()) {
    return { ok: true, types: [] }
  }
  const parts = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    return { ok: true, types: [] }
  }
  const invalid = parts.filter((p) => !BILLING_TYPE_SET.has(p))
  if (invalid.length) {
    return {
      error: `Invalid billing_type value(s): ${invalid.join(", ")}. Allowed: ${BILLING_TYPE_VALUES.join(", ")}.`,
      field: "billing_type",
    }
  }
  return { ok: true, types: parts as BillingType[] }
}

/**
 * Single calendar month only. Empty/missing uses current month (local) when `defaultWhenMissing` is true.
 * Comma or other range syntax → error. Malformed → error.
 */
export function parseSingleBillingMonthParam(
  raw: string | null,
  options: { defaultWhenMissing: boolean }
): { ok: true; month: string } | FinanceApiErrorBody {
  if (raw == null || !String(raw).trim()) {
    if (options.defaultWhenMissing) {
      return { ok: true, month: format(new Date(), "yyyy-MM") }
    }
    return {
      error: "billing_month is required and must be a single value in YYYY-MM format.",
      field: "billing_month",
    }
  }
  const t = String(raw).trim()
  if (t.includes(",")) {
    return {
      error: "billing_month must be a single YYYY-MM month, not a comma-separated range or list.",
      field: "billing_month",
    }
  }
  if (!YYYY_MM.test(t)) {
    return {
      error: "billing_month must match YYYY-MM (e.g. 2026-04).",
      field: "billing_month",
    }
  }
  const d = parse(t, "yyyy-MM", new Date())
  if (!isValid(d) || format(d, "yyyy-MM") !== t) {
    return {
      error: "billing_month is not a valid calendar month.",
      field: "billing_month",
    }
  }
  return { ok: true, month: t }
}

/** Widest multi-month window a single finance hub request may derive (2 FYs). */
export const MAX_BILLING_MONTH_RANGE_MONTHS = 24

function isValidYyyyMm(t: string): boolean {
  if (!YYYY_MM.test(t)) return false
  const d = parse(t, "yyyy-MM", new Date())
  return isValid(d) && format(d, "yyyy-MM") === t
}

/**
 * Multi-month window for the finance hub list APIs, mirroring the store's
 * `monthRange { from, to }`. Both params are required together; expansion is
 * inclusive and ascending. Capped at {@link MAX_BILLING_MONTH_RANGE_MONTHS}.
 */
export function parseBillingMonthRangeParams(
  fromRaw: string | null,
  toRaw: string | null
): { ok: true; months: string[] } | FinanceApiErrorBody {
  const from = String(fromRaw ?? "").trim()
  const to = String(toRaw ?? "").trim()
  if (!from || !to) {
    return {
      error: "from and to must both be provided as YYYY-MM months.",
      field: !from ? "from" : "to",
    }
  }
  if (!isValidYyyyMm(from)) {
    return { error: "from must be a valid calendar month in YYYY-MM format.", field: "from" }
  }
  if (!isValidYyyyMm(to)) {
    return { error: "to must be a valid calendar month in YYYY-MM format.", field: "to" }
  }
  if (from > to) {
    return { error: "from must not be after to.", field: "from" }
  }
  const months: string[] = []
  let [year, month] = from.split("-").map(Number) as [number, number]
  const [endYear, endMonth] = to.split("-").map(Number) as [number, number]
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`)
    if (months.length > MAX_BILLING_MONTH_RANGE_MONTHS) {
      return {
        error: `Month range too wide: maximum ${MAX_BILLING_MONTH_RANGE_MONTHS} months per request.`,
        field: "from",
      }
    }
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return { ok: true, months }
}

export function filterRecordsByBillingTypes<T extends { billing_type?: unknown; billingType?: unknown }>(
  rows: T[],
  types: BillingType[]
): T[] {
  if (types.length === 0) return rows
  const want = new Set(types)
  return rows.filter((row) => {
    const bt = row.billing_type ?? row.billingType
    return typeof bt === "string" && want.has(bt as BillingType)
  })
}

const ARRAY_KEYS = ["records", "data", "items", "result"] as const

function filterFirstArrayField(
  o: Record<string, unknown>,
  types: BillingType[]
): Record<string, unknown> | null {
  const out = { ...o }
  for (const key of ARRAY_KEYS) {
    const arr = o[key]
    if (Array.isArray(arr)) {
      out[key] = filterRecordsByBillingTypes(arr as { billing_type?: unknown }[], types)
      return out
    }
  }
  return null
}

/** Apply strict billing_type filtering so upstream cannot silently return payables when only receivables were requested. */
export function applyBillingTypeFilterToPayload(data: unknown, types: BillingType[]): unknown {
  if (types.length === 0) return data
  if (Array.isArray(data)) {
    return filterRecordsByBillingTypes(data, types)
  }
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>
    const top = filterFirstArrayField(o, types)
    if (top) return top
    const inner = o.data
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const nested = filterFirstArrayField(inner as Record<string, unknown>, types)
      if (nested) return { ...o, data: nested }
    }
  }
  return data
}
