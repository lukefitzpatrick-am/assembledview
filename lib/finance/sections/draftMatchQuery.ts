/**
 * Load approved app invoices + live Xero DRAFT AR, then compare (CB-5).
 */

import "server-only"

import { sql } from "drizzle-orm"

import { getDb } from "@/db"
import {
  compareDraftsToApproved,
  groupDraftMatchRows,
  type DraftMatchApproved,
  type DraftMatchReport,
  type DraftMatchStamp,
  type DraftMatchXero,
} from "@/lib/finance/sections/draftMatch"
import { loadMbaOptionsForQueue } from "@/lib/finance/sections/xero/enrichPendingFromXero"
import { setFinanceBillingRecordXeroMatch } from "@/lib/data/writeFinance"
import { coerceDollars, dollarsToCents } from "@/lib/xero/money"
import { rowsOf } from "@/lib/xero/dbRows"
import { sqlPullXeroLogWhere } from "@/lib/xero/syncLogNotes"
import { loadMbaMasters, loadScopeOfWorkRefs } from "@/lib/xero/applyMatchMba"
import { loadContactLinks } from "@/lib/xero/contactLinks"
import {
  resolveClientFromContact,
  type AliasRow,
  type ClientRow,
} from "@/lib/xero/normalizeContact"

export type DraftMatchQuery = {
  clientIds: number[]
}

type ApprovedRow = {
  invoice_key: string | null
  clients_id: number | null
  client_name: string | null
  mba_number: string | null
  billing_month: string | null
  approved_amount_cents: number | null
  total: unknown
}

type ArRow = {
  xero_invoice_id: string | null
  invoice_number: string | null
  reference_raw: string | null
  issue_date: string | null
  status: string | null
  sub_total: unknown
  xero_contact_id: string | null
  contact_name: string | null
}

function ymdFromPg(value: unknown): string | null {
  if (value == null) return null
  const s = typeof value === "string" ? value : String(value)
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s.trim())
  return m?.[1] ?? null
}

function monthFromYmd(ymd: string | null): string {
  if (!ymd || ymd.length < 7) return ""
  return ymd.slice(0, 7)
}

function centsFromApproved(row: ApprovedRow): number {
  if (row.approved_amount_cents != null && Number.isFinite(Number(row.approved_amount_cents))) {
    return Math.round(Number(row.approved_amount_cents))
  }
  return dollarsToCents(coerceDollars(row.total))
}

export function normalizeDraftMatchQuery(raw: { clients?: number[] }): DraftMatchQuery {
  return {
    clientIds: [...new Set((raw.clients ?? []).filter((n) => Number.isFinite(n) && n > 0))],
  }
}

async function loadLastPulledAt(): Promise<string | null> {
  const db = getDb()
  const row = rowsOf<{ run_finished_at: string | null }>(
    await db.execute(sql`
      SELECT run_finished_at::text AS run_finished_at
      FROM xero_sync_log
      WHERE ${sqlPullXeroLogWhere}
      ORDER BY id DESC
      LIMIT 1
    `)
  )[0]
  return row?.run_finished_at ?? null
}

async function persistAutoStamps(stamps: DraftMatchStamp[]): Promise<number> {
  let n = 0
  for (const stamp of stamps) {
    if (stamp.matched_by !== "auto") continue
    try {
      await setFinanceBillingRecordXeroMatch({
        invoiceKey: stamp.invoice_key,
        xeroInvoiceId: stamp.xero_invoice_id,
        matchedBy: "auto",
      })
      n++
    } catch {
      // Already manual, missing row, or xero: key — skip.
    }
  }
  return n
}

export async function fetchDraftMatchReport(
  query: DraftMatchQuery
): Promise<DraftMatchReport> {
  const db = getDb()
  const [approvedRaw, ar, clients, aliases, links, masters, scopes, mbaOptions, lastPulledAt] =
    await Promise.all([
      rowsOf<ApprovedRow>(
        await db.execute(sql`
          SELECT
            invoice_key,
            clients_id,
            client_name,
            mba_number,
            billing_month,
            approved_amount_cents,
            total
          FROM finance_billing_records
          WHERE approved_at IS NOT NULL
            AND invoice_key NOT LIKE 'xero:%'
            AND billing_type IN ('media', 'sow', 'retainer')
        `)
      ),
      rowsOf<ArRow>(
        await db.execute(sql`
          SELECT
            i.xero_invoice_id,
            i.invoice_number,
            i.reference_raw,
            i.issue_date::text AS issue_date,
            i.status,
            i.sub_total,
            i.xero_contact_id,
            c.name AS contact_name
          FROM xero_ar_invoices i
          LEFT JOIN xero_contacts c ON c.xero_contact_id = i.xero_contact_id
        `)
      ),
      rowsOf<{ id: number; mp_client_name: string | null }>(
        await db.execute(sql`SELECT id, mp_client_name FROM clients`)
      ),
      rowsOf<{ contact_key: string; client_id: number }>(
        await db.execute(sql`SELECT contact_key, client_id FROM xero_client_aliases`)
      ),
      loadContactLinks(),
      loadMbaMasters(),
      loadScopeOfWorkRefs(),
      loadMbaOptionsForQueue(),
      loadLastPulledAt().catch(() => null),
    ])

  const clientRows: ClientRow[] = clients.map((c) => ({
    id: Number(c.id),
    mp_client_name: c.mp_client_name,
    payment_days: null,
    payment_terms: null,
  }))
  const aliasRows: AliasRow[] = aliases.map((a) => ({
    contact_key: a.contact_key,
    client_id: Number(a.client_id),
  }))

  const approved: DraftMatchApproved[] = []
  for (const row of approvedRaw) {
    const invoice_key = (row.invoice_key ?? "").trim()
    if (!invoice_key) continue
    const clients_id = Number(row.clients_id)
    if (!Number.isFinite(clients_id) || clients_id <= 0) continue
    const billing_month = (row.billing_month ?? "").trim()
    if (!/^\d{4}-\d{2}$/.test(billing_month)) continue
    approved.push({
      invoice_key,
      clients_id,
      client_name: (row.client_name ?? "").trim() || "Unknown client",
      mba_number: row.mba_number?.trim() ? row.mba_number.trim() : null,
      billing_month,
      approved_amount_cents: centsFromApproved(row),
    })
  }

  const drafts: DraftMatchXero[] = []
  for (const row of ar) {
    const xero_invoice_id = (row.xero_invoice_id ?? "").trim()
    if (!xero_invoice_id) continue
    const resolved = resolveClientFromContact(row.contact_name ?? "", clientRows, aliasRows, {
      xeroContactId: row.xero_contact_id,
      links,
    })
    drafts.push({
      xero_invoice_id,
      invoice_number: row.invoice_number,
      reference_raw: row.reference_raw,
      clients_id: resolved.resolved ? resolved.clientsId : null,
      client_name: resolved.resolved ? resolved.clientName : row.contact_name,
      billing_month: monthFromYmd(ymdFromPg(row.issue_date)),
      sub_total_cents: dollarsToCents(coerceDollars(row.sub_total)),
      status: row.status ?? "",
    })
  }

  const clientFilter = query.clientIds.length > 0 ? new Set(query.clientIds) : null
  const approvedFiltered = clientFilter
    ? approved.filter((a) => clientFilter.has(a.clients_id))
    : approved
  const draftsFiltered = clientFilter
    ? drafts.filter((d) => d.clients_id != null && clientFilter.has(d.clients_id))
    : drafts

  const { rows } = compareDraftsToApproved({
    approved: approvedFiltered,
    drafts: draftsFiltered,
    masters,
    scopes,
  })

  const autoStamps = rows.flatMap((r) => r.stamps)
  await persistAutoStamps(autoStamps)

  const grouped = groupDraftMatchRows(rows)
  return {
    lastPulledAt,
    grouped,
    counts: {
      Differs: grouped.Differs.length,
      Missing: grouped.Missing.length,
      Extra: grouped.Extra.length,
      Agrees: grouped.Agrees.length,
    },
    rows,
    mbaOptions,
    approvedCandidates: approvedFiltered,
  }
}

export { persistAutoStamps }
