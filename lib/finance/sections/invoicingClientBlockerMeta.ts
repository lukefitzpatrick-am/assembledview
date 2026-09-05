/**
 * Client ABN / legal name for invoicing row blockers.
 * GET /api/clients already exists — do not add an endpoint. Raw legal name
 * (no display-name fallback) so `clientMissingBlockers` can see empties.
 * There is no `po_required` column; do not re-read one (C-84).
 */

import { clientApiRowToFinanceExcelMeta } from "@/lib/finance/excelFinanceExport"
import type { InvoicingClientBlockerMeta } from "@/lib/finance/sections/invoicingRowPresentation"

export async function loadInvoicingClientBlockerMeta(): Promise<
  Map<number, InvoicingClientBlockerMeta>
> {
  const empty = new Map<number, InvoicingClientBlockerMeta>()
  if (typeof fetch === "undefined") return empty
  try {
    const res = await fetch("/api/clients")
    if (!res.ok) return empty
    const data = (await res.json()) as unknown
    if (!Array.isArray(data)) return empty
    const out = new Map<number, InvoicingClientBlockerMeta>()
    for (const raw of data) {
      if (!raw || typeof raw !== "object") continue
      const row = raw as Record<string, unknown>
      const id = Number(row.id ?? row.clients_id)
      if (!Number.isFinite(id) || id <= 0) continue
      const parsed = clientApiRowToFinanceExcelMeta(row)
      out.set(id, {
        abn: parsed.abn,
        legalBusinessName: parsed.legalBusinessName,
      })
    }
    return out
  } catch {
    return empty
  }
}
