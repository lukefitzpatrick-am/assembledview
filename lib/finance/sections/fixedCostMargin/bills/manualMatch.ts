/**
 * Saved manual matches of supplier bill lines (MAR-4, `ap_bill_line_matches`).
 * Request validation and the bill line lookup the API uses before saving.
 * Pure. No I/O.
 */

import { exGstCentsOf, type RawBillRow } from "./parse"

/** migration_markers key that turns manual matching on. */
export const MANUAL_MATCH_MARKER = "0107_ap_bill_line_matches"

export const MANUAL_MATCH_NOT_READY_MESSAGE =
  "Manual bill matches need migration 0107 (ap_bill_line_matches). Run sql/supabase/2026-10-28_0107_ap_bill_line_matches_SUPABASE.sql first."

export const MANUAL_MATCH_NOTE_MAX = 500

export type CreateManualMatchInput = {
  xeroInvoiceId: string
  xeroLineItemId: string
  /** Lower-case. */
  mbaNumber: string
  /** Lower-case. */
  lineItemId: string
  /** YYYY-MM */
  month: string
  note: string | null
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string }

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

/** POST body to a create input. Ids are trimmed; MBA and line id lower-cased. */
export function parseCreateManualMatchBody(raw: unknown): ParseResult<CreateManualMatchInput> {
  if (!raw || typeof raw !== "object") return { ok: false, message: "Expected an object body." }
  const r = raw as Record<string, unknown>
  const xeroInvoiceId = str(r.xeroInvoiceId)
  const xeroLineItemId = str(r.xeroLineItemId)
  const mbaNumber = str(r.mbaNumber).toLowerCase()
  const lineItemId = str(r.lineItemId).toLowerCase()
  const month = str(r.month)
  const noteRaw = str(r.note)
  if (!xeroInvoiceId || !xeroLineItemId) return { ok: false, message: "xeroInvoiceId and xeroLineItemId are required." }
  if (!mbaNumber || !lineItemId) return { ok: false, message: "mbaNumber and lineItemId are required." }
  if (!lineItemId.startsWith(mbaNumber)) {
    return { ok: false, message: `Line ${lineItemId} does not belong to ${mbaNumber}.` }
  }
  if (!MONTH_RE.test(month)) return { ok: false, message: "month must be YYYY-MM." }
  if (noteRaw.length > MANUAL_MATCH_NOTE_MAX) {
    return { ok: false, message: `note must be ${MANUAL_MATCH_NOTE_MAX} characters or fewer.` }
  }
  return { ok: true, value: { xeroInvoiceId, xeroLineItemId, mbaNumber, lineItemId, month, note: noteRaw || null } }
}

/** DELETE `id` query value to a positive integer id. */
export function parseManualMatchId(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw.trim())) return null
  const n = Number.parseInt(raw.trim(), 10)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/**
 * The bill line with this Xero LineItemID: its position and ex GST amount,
 * computed the same way the matcher does (so a saved amount equals the
 * matcher's amount until the bill changes). Null when the line is not on the
 * bill or has no amount.
 */
export function billLineForMatch(
  bill: Pick<RawBillRow, "lineItems" | "lineAmountTypes">,
  xeroLineItemId: string
): { lineIndex: number; exGstCents: number } | null {
  const items = Array.isArray(bill.lineItems) ? (bill.lineItems as Array<Record<string, unknown>>) : []
  const want = xeroLineItemId.trim().toLowerCase()
  for (let i = 0; i < items.length; i += 1) {
    const li = items[i] ?? {}
    if (String(li.LineItemID ?? "").trim().toLowerCase() !== want) continue
    const amount = Number(li.LineAmount)
    if (li.LineAmount == null || li.LineAmount === "" || !Number.isFinite(amount) || amount === 0) return null
    const tax = li.TaxAmount == null || li.TaxAmount === "" ? null : Number(li.TaxAmount)
    return { lineIndex: i, exGstCents: exGstCentsOf(amount, Number.isFinite(tax) ? tax : null, bill.lineAmountTypes) }
  }
  return null
}

/** `YYYY-MM` to the first day of the month for the `month date` column. */
export function monthToDate(month: string): string {
  return `${month}-01`
}

/**
 * A `date` value to `YYYY-MM`. Loaders select `to_char(month, 'YYYY-MM')`;
 * a Date (node-postgres parses `date` as local midnight) uses local parts so
 * Melbourne time never shifts it to the month before.
 */
export function dateToMonth(value: unknown): string {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`
  }
  return String(value ?? "").slice(0, 7)
}
