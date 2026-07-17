import axios from "axios"
import { xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"
import type { BillingRecord } from "@/lib/types/financeBilling"

/**
 * Domain 5 Stage 2.2a — read-only overlay of persisted finance_billing_records
 * onto derived BillingRecord rows.
 *
 * Default state when no row exists: billed=false, all timestamps/ids null.
 * No write happens here; this is a pure read overlay. Materialisation
 * (lazy row creation) is Stage 2.2b.
 */

export type PersistedFinanceStatusRow = {
  id: number
  clients_id: number
  mba_number: string | null
  campaign_name: string | null
  billing_type: "media" | "sow" | "retainer"
  billing_month: string
  billed: boolean
  billed_at: number | null
  billed_by: number | null
  notes: string | null
  exported_at: number | null
  exported_by: number | null
  invoice_key: string | null
}

/**
 * Compose the discriminated invoice_key used to overlay status onto derived rows
 * and to key lazy materialisation. Stage 2.2b-ii (Option B): media and sow key on
 * the stored mba_number, which uniquely implies the client, so the key no longer
 * depends on resolved clients_id. Retainers have no mba_number and take clients_id
 * straight from clients.id, so they keep it.
 *
 *   media | sow   -> media:{mba_number}:{billing_month}
 *                    sow:{mba_number}:{billing_month}
 *   retainer      -> retainer:{clients_id}:{billing_month}
 *   payable       -> null (later stage)
 *
 * clientsId remains a parameter for the retainer branch and to preserve call sites;
 * it is intentionally unused for media and sow.
 */
export function composeInvoiceKey(
  billingType: BillingRecord["billing_type"],
  clientsId: number,
  mbaNumber: string | null,
  campaignName: string | null,
  billingMonth: string
): string | null {
  if (!billingMonth) return null
  if (billingType === "retainer") {
    return `retainer:${clientsId}:${billingMonth}`
  }
  if (billingType === "payable") return null
  const mba = (mbaNumber ?? "").trim()
  if (!mba) return null
  return `${billingType}:${mba}:${billingMonth}`
}

/**
 * Fetches all finance_billing_records rows for the given month.
 *
 * Stage 2.2a uses a simple GET-all-then-filter pattern matching the existing
 * `parseList` approach in `xanoFinanceApi.ts`. If volume becomes an issue we
 * can move to a server-side filter param later — three rows today, so this
 * is fine.
 */
export async function fetchPersistedFinanceStatusForMonth(
  billingMonth: string
): Promise<PersistedFinanceStatusRow[]> {
  if (!billingMonth) return []
  try {
    const url = xanoUrl("finance_billing_records", "XANO_CLIENTS_BASE_URL")
    const response = await axios.get(url, { headers: xanoAuthHeaderRecord() })
    const data = response.data
    const rows: PersistedFinanceStatusRow[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
    return rows.filter((r) => r.billing_month === billingMonth)
  } catch (error) {
    console.error("[finance-overlay] failed to fetch persisted status", {
      billingMonth,
      message: error instanceof Error ? error.message : String(error),
    })
    // Read overlay must not break the page. Empty array → derived rows render with defaults.
    return []
  }
}

/**
 * Build a fast lookup map keyed by invoice_key.
 * Only includes rows that have a non-null invoice_key.
 */
export function indexPersistedStatusByInvoiceKey(
  rows: PersistedFinanceStatusRow[]
): Map<string, PersistedFinanceStatusRow> {
  const map = new Map<string, PersistedFinanceStatusRow>()
  for (const r of rows) {
    if (r.invoice_key && r.invoice_key.length > 0) {
      map.set(r.invoice_key, r)
    }
  }
  return map
}

/**
 * Apply overlay onto a derived BillingRecord. Returns a new record with overlay
 * fields merged in. Schedule-derived fields (amounts, line_items, status) are
 * authoritative and never overridden — overlay touches status-overlay fields only.
 */
export function applyStatusOverlay(
  record: BillingRecord,
  overlayMap: Map<string, PersistedFinanceStatusRow>
): BillingRecord {
  const key = composeInvoiceKey(
    record.billing_type,
    record.clients_id,
    record.mba_number,
    record.campaign_name,
    record.billing_month
  )
  if (!key) {
    return {
      ...record,
      persisted_record_id: null,
      billed: false,
      billed_at: null,
      billed_by: null,
      notes: null,
      exported_at: null,
      exported_by: null,
      invoice_key: null,
    }
  }
  const persisted = overlayMap.get(key)
  if (!persisted) {
    return {
      ...record,
      persisted_record_id: null,
      billed: false,
      billed_at: null,
      billed_by: null,
      notes: null,
      exported_at: null,
      exported_by: null,
      invoice_key: key,
    }
  }
  return {
    ...record,
    persisted_record_id: persisted.id,
    billed: persisted.billed === true,
    billed_at: persisted.billed_at ?? null,
    billed_by: persisted.billed_by ?? null,
    notes: persisted.notes ?? null,
    exported_at: persisted.exported_at ?? null,
    exported_by: persisted.exported_by ?? null,
    invoice_key: persisted.invoice_key ?? key,
  }
}
