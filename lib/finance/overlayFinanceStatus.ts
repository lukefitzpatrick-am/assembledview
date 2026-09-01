import { detectBilledDrift, toBilledLineSnapshots } from "@/lib/finance/billedDrift"
import {
  resolveBillingState,
  type BillingXeroEvidence,
} from "@/lib/finance/billingLifecycle"
import { fetchXeroBillingEvidenceByInvoiceIds } from "@/lib/finance/xeroInvoiceEvidence"
import { readFinanceBillingRecords } from "@/lib/data/readFinance"
import type { BillingRecord } from "@/lib/types/financeBilling"

/**
 * Domain 5 Stage 2.2a — read-only overlay of persisted finance_billing_records
 * onto derived BillingRecord rows.
 *
 * Default overlay when no row exists: billed=false, stamps null, derived `state` = ready.
 * Lifecycle is derived via `resolveBillingState` (never a stored state column).
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
  /** Present after mark-billed stores an amount snapshot; may be absent on legacy rows. */
  billed_amount?: number | null
  billed_lines_hash?: string | null
  notes: string | null
  exported_at: number | string | null
  exported_by: number | null
  invoice_key: string | null
  approved_at?: string | number | null
  matched_xero_invoice_id?: string | null
  /** Joined from xero_ar_invoices at overlay time; not stored on the billing row. */
  xero?: BillingXeroEvidence | null
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
 * Stage 2.2a uses a simple GET-all-then-filter pattern matching
 * `readFinanceBillingRecords`. If volume becomes an issue we can move to a
 * server-side filter param later.
 */
export async function fetchPersistedFinanceStatusForMonth(
  billingMonth: string
): Promise<PersistedFinanceStatusRow[]> {
  if (!billingMonth) return []
  const rows = await fetchAllPersistedFinanceStatusRows(billingMonth)
  return filterPersistedStatusRowsForMonth(rows, billingMonth)
}

/**
 * Fetch ALL finance_billing_records rows (the upstream request is unfiltered
 * anyway). The multi-month billing path fetches once and month-filters with
 * {@link filterPersistedStatusRowsForMonth} per month — identical to what N
 * single-month calls would have produced.
 *
 * Errors propagate — never soft-fail to [] (dead backend ≠ “nothing billed”).
 * Route / UI boundaries map failures to HTTP 5xx / ViewState error.
 */
export async function fetchAllPersistedFinanceStatusRows(
  _logContextMonth?: string
): Promise<PersistedFinanceStatusRow[]> {
  // DATA_BACKEND_FINANCE / DATA_BACKEND — reads Postgres; writes go through writeFinance.ts.
  const rows = (await readFinanceBillingRecords()) as unknown as PersistedFinanceStatusRow[]
  const ids = rows.flatMap((r) => {
    const id =
      typeof r.matched_xero_invoice_id === "string" ? r.matched_xero_invoice_id.trim() : ""
    return id ? [id] : []
  })
  const xeroById = await fetchXeroBillingEvidenceByInvoiceIds(ids)
  return rows.map((r) => {
    const id =
      typeof r.matched_xero_invoice_id === "string" ? r.matched_xero_invoice_id.trim() : ""
    return { ...r, xero: id ? (xeroById.get(id) ?? null) : null }
  })
}

function overlayStampIso(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value === 0) return null
    const ms = value < 1e12 ? value * 1000 : value
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const s = String(value).trim()
  return s.length > 0 ? s : null
}

function withDerivedLifecycle(
  record: BillingRecord,
  evidence: {
    approvedAt: unknown
    exportedAt: unknown
    xero: BillingXeroEvidence | null
  }
): BillingRecord {
  const resolved = resolveBillingState({
    approvedAt: overlayStampIso(evidence.approvedAt),
    exportedAt: overlayStampIso(evidence.exportedAt),
    xero: evidence.xero,
  })
  return {
    ...record,
    approved_at: overlayStampIso(evidence.approvedAt),
    state: resolved.state,
    state_reason: resolved.reason,
  }
}

/** Month scoping shared by the single-month and multi-month overlay paths. */
export function filterPersistedStatusRowsForMonth(
  rows: PersistedFinanceStatusRow[],
  billingMonth: string
): PersistedFinanceStatusRow[] {
  return rows.filter((r) => r.billing_month === billingMonth)
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
    return withDerivedLifecycle(
      {
        ...record,
        persisted_record_id: null,
        billed: false,
        billed_at: null,
        billed_by: null,
        billed_amount: null,
        billed_lines_hash: null,
        billed_drift: false,
        billed_drift_delta: null,
        notes: null,
        exported_at: null,
        exported_by: null,
        invoice_key: null,
      },
      { approvedAt: null, exportedAt: null, xero: null }
    )
  }
  const persisted = overlayMap.get(key)
  if (!persisted) {
    return withDerivedLifecycle(
      {
        ...record,
        persisted_record_id: null,
        billed: false,
        billed_at: null,
        billed_by: null,
        billed_amount: null,
        billed_lines_hash: null,
        billed_drift: false,
        billed_drift_delta: null,
        notes: null,
        exported_at: null,
        exported_by: null,
        invoice_key: key,
      },
      { approvedAt: null, exportedAt: null, xero: null }
    )
  }
  const billed = persisted.billed === true
  const billed_amount =
    typeof persisted.billed_amount === "number" && Number.isFinite(persisted.billed_amount)
      ? persisted.billed_amount
      : null
  const billed_lines_hash =
    typeof persisted.billed_lines_hash === "string" && persisted.billed_lines_hash.length > 0
      ? persisted.billed_lines_hash
      : null
  // Schedule-derived total / line_items stay authoritative; drift is derived only.
  const drift = detectBilledDrift({
    billed,
    billedAmount: billed_amount,
    billedLinesHash: billed_lines_hash,
    currentTotal: record.total,
    currentLines: toBilledLineSnapshots(record.line_items ?? []),
  })
  return withDerivedLifecycle(
    {
      ...record,
      persisted_record_id: persisted.id,
      billed,
      billed_at: persisted.billed_at ?? null,
      billed_by: persisted.billed_by ?? null,
      billed_amount,
      billed_lines_hash,
      billed_drift: drift.drift,
      billed_drift_delta: drift.delta,
      notes: persisted.notes ?? null,
      exported_at: persisted.exported_at ?? null,
      exported_by: persisted.exported_by ?? null,
      invoice_key: persisted.invoice_key ?? key,
    },
    {
      approvedAt: persisted.approved_at,
      exportedAt: persisted.exported_at,
      xero: persisted.xero ?? null,
    }
  )
}
