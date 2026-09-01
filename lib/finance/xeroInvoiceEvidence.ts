/**
 * Read-only Xero AR snapshot for billing lifecycle derivation.
 * Does not write, match, or sync.
 */

import { inArray } from "drizzle-orm"

import { getDb, schema } from "@/db"
import type { BillingXeroEvidence } from "@/lib/finance/billingLifecycle"

function num(v: unknown): number {
  if (v == null) return 0
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function dateStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

export async function fetchXeroBillingEvidenceByInvoiceIds(
  ids: string[]
): Promise<Map<string, BillingXeroEvidence>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))]
  const map = new Map<string, BillingXeroEvidence>()
  if (unique.length === 0) return map

  const db = getDb()
  const rows = await db
    .select({
      xeroInvoiceId: schema.xeroArInvoices.xeroInvoiceId,
      status: schema.xeroArInvoices.status,
      amountDue: schema.xeroArInvoices.amountDue,
      dueDate: schema.xeroArInvoices.dueDate,
      fullyPaidDate: schema.xeroArInvoices.fullyPaidDate,
    })
    .from(schema.xeroArInvoices)
    .where(inArray(schema.xeroArInvoices.xeroInvoiceId, unique))

  for (const row of rows) {
    const id = row.xeroInvoiceId
    if (!id) continue
    map.set(id, {
      status: String(row.status ?? ""),
      amountDue: num(row.amountDue),
      dueDate: dateStr(row.dueDate),
      fullyPaidDate: dateStr(row.fullyPaidDate),
    })
  }
  return map
}
