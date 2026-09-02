/**
 * Approve POST is keys + month only. The snapshot grain is always taken from
 * a server-composed BillingRecord via grainFromBillingRecord — never from the
 * client body.
 */

import { parseSingleBillingMonthParam } from "@/lib/finance/billingApiParams"
import { grainFromBillingRecord, type BillingApproveGrain } from "@/lib/finance/billingApproveGrain"
import { composeInvoiceKey } from "@/lib/finance/overlayFinanceStatus"
import type { BillingRecord } from "@/lib/types/financeBilling"

export type ApproveRequestParseOk = {
  ok: true
  invoice_keys: string[]
  billing_month: string
  reapprove: boolean
}

export type ApproveRequestParseErr = {
  ok: false
  message: string
}

export type ApproveKeyError = {
  invoice_key: string
  error: "not_found" | "already_approved" | "already_exported"
  status: 404 | 409
}

export function parseInvoiceKeys(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  const keys: string[] = []
  for (const item of raw) {
    if (typeof item !== "string") continue
    const key = item.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys.length > 0 ? keys : null
}

/**
 * Body contract: `{ invoice_keys, billing_month, reapprove? }`.
 * Extra fields (including `grains`) are ignored — the server never snapshots them.
 */
export function parseApproveRequestBody(raw: Record<string, unknown>): ApproveRequestParseOk | ApproveRequestParseErr {
  const invoice_keys = parseInvoiceKeys(raw.invoice_keys)
  if (!invoice_keys) {
    return { ok: false, message: "invoice_keys must be a non-empty string array." }
  }
  const monthRaw =
    typeof raw.billing_month === "string" || raw.billing_month == null
      ? (raw.billing_month as string | null)
      : String(raw.billing_month)
  const monthParsed = parseSingleBillingMonthParam(monthRaw, { defaultWhenMissing: false })
  if (!("ok" in monthParsed && monthParsed.ok)) {
    return {
      ok: false,
      message: "error" in monthParsed ? monthParsed.error : "billing_month is required and must be YYYY-MM.",
    }
  }
  return {
    ok: true,
    invoice_keys,
    billing_month: monthParsed.month,
    reapprove: raw.reapprove === true,
  }
}

export function resolveApproveGrains(
  invoiceKeys: string[],
  records: BillingRecord[]
): { grains: BillingApproveGrain[]; notFound: string[] } {
  const byKey = new Map<string, BillingRecord>()
  for (const rec of records) {
    const k = rec.invoice_key?.trim()
    if (k && !byKey.has(k)) byKey.set(k, rec)
  }
  const grains: BillingApproveGrain[] = []
  const notFound: string[] = []
  for (const key of invoiceKeys) {
    const rec = byKey.get(key)
    const grain = rec ? grainFromBillingRecord(rec) : null
    if (!grain) {
      notFound.push(key)
      continue
    }
    const composed = composeInvoiceKey(
      grain.billing_type,
      grain.clients_id,
      grain.mba_number,
      grain.campaign_name,
      grain.billing_month
    )
    if (!composed || composed !== key) {
      notFound.push(key)
      continue
    }
    grains.push(grain)
  }
  return { grains, notFound }
}

export function notFoundErrors(keys: string[]): ApproveKeyError[] {
  return keys.map((invoice_key) => ({
    invoice_key,
    error: "not_found" as const,
    status: 404 as const,
  }))
}

export function persistedApproveErrors(
  items: Array<{ invoice_key: string; error: "already_approved" | "already_exported" }>
): ApproveKeyError[] {
  return items.map((item) => ({
    invoice_key: item.invoice_key,
    error: item.error,
    status: 409 as const,
  }))
}
