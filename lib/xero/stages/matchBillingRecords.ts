/**
 * Nightly billing match. Runs after invoice ingest on the invoices cron.
 * One savepoint per stamp so a bad row does not roll the stage back.
 * Counts land on that cron's xero_sync_log notes.
 */

import { sql } from "drizzle-orm"

import { getClient, getDb } from "@/db"
import { loadMbaMasters, loadScopeOfWorkRefs } from "@/lib/xero/applyMatchMba"
import { loadContactLinks } from "@/lib/xero/contactLinks"
import { rowsOf } from "@/lib/xero/dbRows"
import { coerceDollars, dollarsToCents } from "@/lib/xero/money"
import {
  firstLineItemDescription,
  matchXeroInvoicesToAppRecords,
  type AppBillingMatchRecord,
  type XeroBillingMatchDecision,
  type XeroBillingMatchInvoice,
} from "@/lib/finance/sections/xeroBillingMatch"

export type BillingMatchStageResult = {
  ok: boolean
  matched: number
  adopted: number
  differs: number
  suggestions: number
  unlinked: number
  failed: number
  error?: string
}

type CurrentStamp = {
  invoiceKey: string
  matchedXeroInvoiceId: string | null
  resolution: string | null
  approvedAmountCents: number | null
}

type SqlTx = {
  savepoint: <T>(fn: (sp: SqlTx) => Promise<T>) => Promise<T>
  unsafe: (query: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>
}

export async function stageMatchBillingRecords(): Promise<BillingMatchStageResult> {
  const empty: BillingMatchStageResult = {
    ok: true,
    matched: 0,
    adopted: 0,
    differs: 0,
    suggestions: 0,
    unlinked: 0,
    failed: 0,
  }
  try {
    const loaded = await loadMatchInputs()
    const decisions = matchXeroInvoicesToAppRecords({
      invoices: loaded.invoices,
      records: loaded.records,
      masters: loaded.masters,
      scopes: loaded.scopes,
    })
    const counts = await persistDecisions(decisions, loaded.current)
    return { ok: true, ...counts }
  } catch (err) {
    return {
      ...empty,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function loadMatchInputs(): Promise<{
  invoices: XeroBillingMatchInvoice[]
  records: AppBillingMatchRecord[]
  masters: Awaited<ReturnType<typeof loadMbaMasters>>
  scopes: Awaited<ReturnType<typeof loadScopeOfWorkRefs>>
  current: Map<string, CurrentStamp>
}> {
  const db = getDb()
  const [masters, scopes, links, recordRows, invoiceRows] = await Promise.all([
    loadMbaMasters(),
    loadScopeOfWorkRefs(),
    loadContactLinks(),
    db.execute(sql`
      SELECT invoice_key, clients_id, billing_type, mba_number, billing_month,
             approved_amount_cents, billed_amount_cents, total,
             matched_by, matched_xero_invoice_id, xero_match_resolution
      FROM finance_billing_records
      WHERE invoice_key IS NOT NULL
        AND invoice_key NOT LIKE 'xero:%'
    `),
    db.execute(sql`
      SELECT xero_invoice_id, status, issue_date::text AS issue_date,
             reference_raw, sub_total, xero_contact_id, line_items_json
      FROM xero_ar_invoices
      WHERE upper(btrim(status)) IN ('DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'DELETED', 'VOIDED')
    `),
  ])

  const clientByContact = new Map<string, number>()
  for (const link of links) {
    if (link.xeroContactKey && Number.isFinite(link.clientId) && link.clientId > 0) {
      clientByContact.set(link.xeroContactKey, link.clientId)
    }
  }

  const current = new Map<string, CurrentStamp>()
  const records: AppBillingMatchRecord[] = []
  for (const row of rowsOf<Record<string, unknown>>(recordRows)) {
    const invoiceKey = text(row.invoice_key)
    if (!invoiceKey) continue
    const approved = intOrNull(row.approved_amount_cents)
    const legacy = intOrNull(row.billed_amount_cents)
    const schedule = row.total == null ? null : dollarsToCents(coerceDollars(row.total))
    records.push({
      invoiceKey,
      clientsId: intOrNull(row.clients_id),
      billingType: text(row.billing_type),
      mbaNumber: text(row.mba_number),
      scopeId: null,
      billingMonth: text(row.billing_month),
      approvedAmountCents: approved,
      scheduleMonthCents: schedule,
      legacyBilledCents: legacy,
      matchedBy: text(row.matched_by),
    })
    current.set(invoiceKey, {
      invoiceKey,
      matchedXeroInvoiceId: text(row.matched_xero_invoice_id),
      resolution: text(row.xero_match_resolution),
      approvedAmountCents: approved,
    })
  }

  const invoices: XeroBillingMatchInvoice[] = []
  for (const row of rowsOf<Record<string, unknown>>(invoiceRows)) {
    const xeroInvoiceId = text(row.xero_invoice_id)
    if (!xeroInvoiceId) continue
    const contactId = text(row.xero_contact_id)
    invoices.push({
      xeroInvoiceId,
      status: text(row.status) ?? "",
      issueDate: text(row.issue_date),
      referenceRaw: text(row.reference_raw),
      firstLineDescription: firstLineItemDescription(row.line_items_json),
      subTotalCents: dollarsToCents(coerceDollars(row.sub_total)),
      linkedClientId: contactId ? (clientByContact.get(contactId) ?? null) : null,
    })
  }

  return { invoices, records, masters, scopes, current }
}

async function persistDecisions(
  decisions: XeroBillingMatchDecision[],
  current: Map<string, CurrentStamp>,
): Promise<Omit<BillingMatchStageResult, "ok" | "error">> {
  const counts = { matched: 0, adopted: 0, differs: 0, suggestions: 0, unlinked: 0, failed: 0 }
  const pg = getClient()
  await pg.begin(async (tx) => {
    const sqlTx = tx as unknown as SqlTx
    for (const decision of decisions) {
      if (decision.kind === "suggestion") {
        counts.suggestions += 1
        continue
      }
      if (decision.kind === "unlink") {
        const cleared = await inSavepoint(sqlTx, async (sp) => {
          const rows = await sp.unsafe(
            `UPDATE finance_billing_records SET
               matched_xero_invoice_id = NULL,
               matched_at = NULL,
               matched_by = NULL,
               xero_match_resolution = NULL,
               xero_expected_source = NULL,
               updated_at = now()
             WHERE matched_xero_invoice_id = $1
             RETURNING invoice_key`,
            [decision.xeroInvoiceId],
          )
          return rows.length
        })
        if (cleared == null) counts.failed += 1
        else counts.unlinked += cleared
        continue
      }

      if (decision.drift === "auto_adopted") counts.adopted += 1
      else counts.differs += 1

      for (const key of decision.invoiceKeys) {
        const prior = current.get(key)
        const expected = decision.expected.find((e) => e.invoiceKey === key)
        if (
          prior &&
          prior.matchedXeroInvoiceId === decision.xeroInvoiceId &&
          prior.resolution === decision.drift &&
          (decision.adoptCents == null || prior.approvedAmountCents === decision.adoptCents)
        ) {
          counts.matched += 1
          continue
        }
        const wrote = await inSavepoint(sqlTx, async (sp) => {
          const rows = await sp.unsafe(
            `UPDATE finance_billing_records SET
               matched_xero_invoice_id = $2,
               matched_at = now(),
               matched_by = 'auto',
               xero_match_resolution = $3,
               xero_expected_source = $4,
               approved_amount_cents = CASE WHEN $5::bigint IS NULL THEN approved_amount_cents ELSE $5::bigint END,
               updated_at = now()
             WHERE invoice_key = $1
               AND invoice_key NOT LIKE 'xero:%'
               AND (matched_by IS NULL OR btrim(matched_by) = '' OR matched_by = 'auto')
             RETURNING id, approved_amount_cents`,
            [
              key,
              decision.xeroInvoiceId,
              decision.drift,
              expected?.source ?? null,
              decision.adoptCents,
            ],
          )
          const row = rows[0]
          if (!row) return 0
          if (decision.adoptCents != null) {
            await sp.unsafe(
              `INSERT INTO finance_edits (
                 finance_billing_records_id, edit_type, field_name, old_value, new_value,
                 edit_status, record_type, edited_by_name
               ) VALUES ($1, 'xero_match', 'approved_amount_cents', $2, $3, 'published', 'billing_record', 'xero-sync')`,
              [
                Number(row.id),
                prior?.approvedAmountCents == null ? null : String(prior.approvedAmountCents),
                String(decision.adoptCents),
              ],
            )
          }
          return 1
        })
        if (wrote == null || wrote === 0) counts.failed += 1
        else counts.matched += 1
      }
    }
  })
  return counts
}

async function inSavepoint(
  tx: SqlTx,
  run: (sp: SqlTx) => Promise<number>,
): Promise<number | null> {
  try {
    return await tx.savepoint(run)
  } catch {
    return null
  }
}

function text(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s.length > 0 ? s : null
}

function intOrNull(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? Math.round(n) : null
}
