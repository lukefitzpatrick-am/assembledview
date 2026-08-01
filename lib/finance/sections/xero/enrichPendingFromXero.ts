/**
 * FIN-7 — join pending billing rows to xero_ar_invoices + contacts for assignment UX.
 * Display enrichment only; does not change matching / has_pending_edits.
 */

import { sql } from "drizzle-orm"
import { getDb } from "@/db"
import { rowsOf } from "@/lib/xero/dbRows"

export type MbaOption = {
  mba_number: string
  campaign_name: string
  client_id: number | null
}

function xeroIdFromInvoiceKey(invoiceKey: unknown): string | null {
  const key = String(invoiceKey ?? "").trim()
  if (!key.startsWith("xero:")) return null
  const id = key.slice("xero:".length).trim()
  return id || null
}

function firstLineDescription(lineItemsJson: unknown): string {
  if (!Array.isArray(lineItemsJson) || lineItemsJson.length === 0) return ""
  const first = lineItemsJson[0] as { Description?: unknown }
  return String(first?.Description ?? "").trim()
}

/**
 * Attach reference / first_line_description / contact_name / invoice_number
 * onto pending rows (by `xero:{id}` invoice_key). Soft-fails to unenriched rows
 * if Postgres/Xero tables are unavailable.
 */
export async function enrichPendingFromXero(
  pending: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (pending.length === 0) return pending

  const idByKey = new Map<string, string>()
  for (const row of pending) {
    const key = String(row.invoice_key ?? "").trim()
    const xid = xeroIdFromInvoiceKey(key)
    if (xid) idByKey.set(key, xid)
  }
  if (idByKey.size === 0) return pending

  const ids = [...new Set(idByKey.values())]
  try {
    const db = getDb()
    const arRows = rowsOf<{
      xero_invoice_id: string
      reference_raw: string | null
      invoice_number: string | null
      line_items_json: unknown
      contact_name: string | null
    }>(
      await db.execute(sql`
        SELECT
          a.xero_invoice_id,
          a.reference_raw,
          a.invoice_number,
          a.line_items_json,
          c.name AS contact_name
        FROM xero_ar_invoices a
        LEFT JOIN xero_contacts c ON c.xero_contact_id = a.xero_contact_id
        WHERE a.xero_invoice_id = ANY(ARRAY[${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `
        )}]::text[])
      `)
    )

    const byXeroId = new Map(arRows.map((r) => [String(r.xero_invoice_id), r]))

    return pending.map((row) => {
      const key = String(row.invoice_key ?? "").trim()
      const xid = idByKey.get(key)
      if (!xid) return row
      const ar = byXeroId.get(xid)
      if (!ar) return row
      return {
        ...row,
        reference: ar.reference_raw ?? "",
        first_line_description: firstLineDescription(ar.line_items_json),
        invoice_number: ar.invoice_number ?? "",
        contact_name: ar.contact_name ?? "",
      }
    })
  } catch (err) {
    console.error("[finance-xero-queue] enrichPendingFromXero failed", err)
    return pending
  }
}

/** Lightweight MBA catalog for guided assign dropdown (filter client-side by client_id). */
export async function loadMbaOptionsForQueue(): Promise<MbaOption[]> {
  try {
    const db = getDb()
    const rows = rowsOf<{
      mba_number: string | null
      campaign_name: string | null
      client_id: number | null
    }>(
      await db.execute(sql`
        SELECT mba_number, campaign_name, client_id
        FROM media_plan_masters
        WHERE mba_number IS NOT NULL AND BTRIM(mba_number) <> ''
        ORDER BY mba_number
      `)
    )
    return rows.map((r) => ({
      mba_number: String(r.mba_number ?? "").trim(),
      campaign_name: String(r.campaign_name ?? "").trim(),
      client_id:
        r.client_id != null && Number.isFinite(Number(r.client_id))
          ? Number(r.client_id)
          : null,
    })).filter((r) => r.mba_number.length > 0)
  } catch (err) {
    console.error("[finance-xero-queue] loadMbaOptionsForQueue failed", err)
    return []
  }
}
