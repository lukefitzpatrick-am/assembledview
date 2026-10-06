/**
 * Sent-to-accounts rows, grouped by billing month, for the clearance report.
 */

import "server-only"

import { desc, eq, sql } from "drizzle-orm"

import { getDb } from "@/db"
import * as schema from "@/db/schema"
import type { ClearanceMonthLoad, ClearanceSendRecord } from "@/lib/finance/runClearanceReports"
import { xeroDraftLines, type ClearanceSourceRow } from "@/lib/finance/clearanceReport"
import { expectedAmount } from "@/lib/finance/sections/xeroBillingMatch"
import { rowsOf } from "@/lib/xero/dbRows"
import { coerceDollars, dollarsToCents } from "@/lib/xero/money"

type BillingRow = {
  id: number
  invoice_key: string
  billing_month: string
  client_name: string | null
  mba_number: string | null
  campaign_name: string | null
  approved_amount_cents: number | null
  total: string | number | null
  billed_amount_cents: number | null
  matched_xero_invoice_id: string | null
  xero_status: string | null
  sub_total: string | number | null
  invoice_number: string | null
  line_items_json: unknown
}

function intOrNull(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

type LineRow = {
  finance_billing_records_id: number | null
  description: string | null
  amount: string | number | null
}

export async function loadClearanceMonths(): Promise<ClearanceMonthLoad[]> {
  const db = getDb()
  const billing = rowsOf<BillingRow>(await db.execute(sql`
    SELECT
      r.id,
      r.invoice_key,
      r.billing_month,
      r.client_name,
      r.mba_number,
      r.campaign_name,
      r.approved_amount_cents,
      r.total,
      r.billed_amount_cents,
      r.matched_xero_invoice_id,
      i.status AS xero_status,
      i.sub_total,
      i.invoice_number,
      i.line_items_json
    FROM finance_billing_records r
    LEFT JOIN xero_ar_invoices i
      ON i.xero_invoice_id = r.matched_xero_invoice_id
    WHERE r.exported_at IS NOT NULL
      AND coalesce(r.invoice_key, '') NOT LIKE 'xero:%'
      AND r.billing_month IS NOT NULL
  `))
  const ids = billing.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))
  const lines =
    ids.length === 0
      ? []
      : rowsOf<LineRow>(await db.execute(sql`
          SELECT finance_billing_records_id, description, amount
          FROM finance_billing_line_items
          WHERE finance_billing_records_id IN (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )})
        `))
  const linesByRecord = new Map<number, { description: string; cents: number }[]>()
  for (const line of lines) {
    const recordId = Number(line.finance_billing_records_id)
    if (!Number.isFinite(recordId)) continue
    const list = linesByRecord.get(recordId) ?? []
    list.push({
      description: (line.description ?? "").trim() || "Line",
      cents: dollarsToCents(coerceDollars(line.amount)),
    })
    linesByRecord.set(recordId, list)
  }

  const byMonth = new Map<string, ClearanceSourceRow[]>()
  for (const row of billing) {
    const month = row.billing_month.slice(0, 7)
    const expected = expectedAmount({
      approvedAmountCents: intOrNull(row.approved_amount_cents),
      scheduleMonthCents:
        row.total == null ? null : dollarsToCents(coerceDollars(row.total)),
      legacyBilledCents: intOrNull(row.billed_amount_cents),
    })
    const source: ClearanceSourceRow = {
      invoiceKey: row.invoice_key,
      billingMonth: month,
      clientName: row.client_name ?? "",
      mbaNumber: row.mba_number ?? "",
      campaignName: row.campaign_name ?? "",
      expectedCents: expected?.cents ?? null,
      xeroInvoiceId: row.matched_xero_invoice_id,
      xeroStatus: row.xero_status,
      draftCents: row.sub_total == null ? null : dollarsToCents(coerceDollars(row.sub_total)),
      invoiceNumber: row.invoice_number,
      appLines: linesByRecord.get(Number(row.id)) ?? [],
      draftLines: xeroDraftLines(row.line_items_json),
    }
    const list = byMonth.get(month) ?? []
    list.push(source)
    byMonth.set(month, list)
  }
  return [...byMonth.entries()].map(([month, rows]) => ({ month, rows }))
}

export async function lastClearanceHash(month: string): Promise<string | null> {
  const rows = await getDb()
    .select({ hash: schema.financeClearanceSends.hash })
    .from(schema.financeClearanceSends)
    .where(eq(schema.financeClearanceSends.month, month))
    .orderBy(desc(schema.financeClearanceSends.sentAt))
    .limit(1)
  return rows[0]?.hash ?? null
}

export async function recordClearanceSend(row: ClearanceSendRecord): Promise<void> {
  await getDb().insert(schema.financeClearanceSends).values({
    month: row.month,
    hash: row.hash,
    counts: row.counts,
  })
}
