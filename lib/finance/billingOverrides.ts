/**
 * Attach `billing_overrides` rows onto {@link LineItemInput} as
 * `billingOverride` (media) / `feeOverride` (fee).
 *
 * Row I/O is Postgres via `lib/data/readBillingOverrides` /
 * `writeBillingOverrides` — do not reintroduce a soft-fail Xano GET here
 * (MB-5: erased manual billing on upstream miss).
 */

import type {
  BillingOverride,
  BillingOverrideReason,
  FeeOverride,
  LineItemInput,
  MonthAmount,
} from "@/lib/finance/campaignFinancials.types"
import { parseMoneyInput, roundMoney2 } from "@/lib/format/money"

export type BillingOverrideComponent = "media" | "fee"

/** Raw override row shape (Postgres / API / client panels). */
export type BillingOverrideRow = {
  id?: number | string
  media_plan_version?: number | string
  media_plan_version_id?: number | string
  media_plan_versions_id?: number | string
  version_id?: number | string
  line_item_id?: string
  lineItemId?: string
  component?: BillingOverrideComponent | string | null
  mode?: string | null
  reason?: string | null
  months?: MonthAmount[] | string | null
  date_basis?: string | null
  dateBasis?: string | null
}

function parseMonths(raw: unknown): MonthAmount[] {
  let value: unknown = raw
  if (typeof value === "string") {
    const t = value.trim()
    if (!t) return []
    try {
      value = JSON.parse(t)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  const out: MonthAmount[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue
    const month = String((entry as { month?: unknown }).month ?? "").trim()
    const amount = parseMoneyInput((entry as { amount?: string | number | null | undefined }).amount) ?? 0
    if (!month) continue
    out.push({ month, amount: roundMoney2(amount) })
  }
  return out
}

function asOverrideReason(raw: unknown): BillingOverrideReason | undefined {
  const s = String(raw ?? "").trim().toLowerCase()
  if (s === "prepayment" || s === "client_terms" || s === "manual") return s
  return undefined
}

function rowLineItemId(row: BillingOverrideRow): string {
  return String(row.line_item_id ?? row.lineItemId ?? "").trim()
}

function rowComponent(row: BillingOverrideRow): BillingOverrideComponent {
  const c = String(row.component ?? "media").trim().toLowerCase()
  return c === "fee" ? "fee" : "media"
}

function rowDateBasis(row: BillingOverrideRow): string {
  return String(row.date_basis ?? row.dateBasis ?? "").trim()
}

export function billingOverrideFromRow(row: BillingOverrideRow): BillingOverride | null {
  const months = parseMonths(row.months)
  if (!months.length) return null
  const mode = String(row.mode ?? "manual").trim().toLowerCase()
  return {
    mode: mode === "auto" ? "auto" : "manual",
    reason: asOverrideReason(row.reason),
    months,
    dateBasis: rowDateBasis(row),
  }
}

export function feeOverrideFromRow(row: BillingOverrideRow): FeeOverride | null {
  const months = parseMonths(row.months)
  if (!months.length) return null
  return {
    mode: "manual",
    reason: asOverrideReason(row.reason),
    months,
    dateBasis: rowDateBasis(row),
    component: "fee",
  }
}

/**
 * Attach table overrides onto line inputs (table wins over any client-stamped override).
 * Rows with `component: 'fee'` → `feeOverride`; otherwise → `billingOverride`.
 */
export function attachOverridesToLineInputs(
  lineItems: LineItemInput[],
  rows: BillingOverrideRow[]
): LineItemInput[] {
  if (!rows.length) return lineItems

  const mediaByLine = new Map<string, BillingOverride>()
  const feeByLine = new Map<string, FeeOverride>()

  for (const row of rows) {
    const id = rowLineItemId(row)
    if (!id) continue
    if (rowComponent(row) === "fee") {
      const fee = feeOverrideFromRow(row)
      if (fee) feeByLine.set(id, fee)
    } else {
      const media = billingOverrideFromRow(row)
      if (media) mediaByLine.set(id, media)
    }
  }

  if (mediaByLine.size === 0 && feeByLine.size === 0) return lineItems

  return lineItems.map((line) => {
    const canon = (() => {
      const s = String(line.lineItemId ?? "").trim()
      const m = /^billing-[^:]+::(.+)$/.exec(s)
      return m?.[1] ? m[1].trim() : s
    })()
    const media =
      mediaByLine.get(line.lineItemId) ?? (canon ? mediaByLine.get(canon) : undefined)
    const fee = feeByLine.get(line.lineItemId) ?? (canon ? feeByLine.get(canon) : undefined)
    if (!media && !fee) return line
    return {
      ...line,
      ...(media ? { billingOverride: media } : {}),
      ...(fee ? { feeOverride: fee } : {}),
    }
  })
}
