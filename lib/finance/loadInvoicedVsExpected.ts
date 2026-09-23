/**
 * Load the invoiced-vs-expected view. Plan rows left-join Xero AR on
 * matched_xero_invoice_id. Unmatched invoices are AR rows no plan record points at.
 */

import "server-only"

import { sql } from "drizzle-orm"

import { getDb } from "@/db"
import {
  buildInvoicedVsExpected,
  fyMonthWindow,
  type FyChoice,
  type InvoicedVsExpectedFilters,
  type InvoicedVsExpectedReport,
  type PlanExpectedRow,
  type UnmatchedInvoiceRow,
} from "@/lib/finance/invoicedVsExpected"
import { rowsOf } from "@/lib/xero/dbRows"
import { coerceDollars, dollarsToCents } from "@/lib/xero/money"

type PlanSql = {
  invoice_key: string
  billing_month: string | null
  client_name: string | null
  clients_id: number | string | null
  mba_number: string | null
  campaign_name: string | null
  billing_type: string | null
  approved_amount_cents: number | string | null
  total: string | number | null
  billed_amount_cents: number | string | null
  matched_xero_invoice_id: string | null
  xero_match_resolution: string | null
  invoice_number: string | null
  status: string | null
  sub_total: string | number | null
}

type InvoiceSql = {
  xero_invoice_id: string | null
  invoice_number: string | null
  status: string | null
  sub_total: string | number | null
  issue_month: string | null
  contact_name: string | null
  client_id: number | string | null
}

function intOrNull(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : null
}

function centsFromDollars(value: unknown): number | null {
  if (value == null || value === "") return null
  return dollarsToCents(coerceDollars(value))
}

export async function loadInvoicedVsExpected(
  filters: InvoicedVsExpectedFilters,
): Promise<InvoicedVsExpectedReport> {
  const { from, to } = fyMonthWindow(filters.fy)
  const db = getDb()
  const [planRows, invoiceRows] = await Promise.all([
    db.execute(sql`
      SELECT
        r.invoice_key,
        r.billing_month,
        r.client_name,
        r.clients_id,
        r.mba_number,
        r.campaign_name,
        r.billing_type,
        r.approved_amount_cents,
        r.total,
        r.billed_amount_cents,
        r.matched_xero_invoice_id,
        r.xero_match_resolution,
        i.invoice_number,
        i.status,
        i.sub_total
      FROM finance_billing_records r
      LEFT JOIN xero_ar_invoices i
        ON i.xero_invoice_id = r.matched_xero_invoice_id
      WHERE coalesce(r.invoice_key, '') NOT LIKE 'xero:%'
        AND left(coalesce(r.billing_month, ''), 7) >= ${from}
        AND left(coalesce(r.billing_month, ''), 7) < ${to}
    `),
    db.execute(sql`
      SELECT
        i.xero_invoice_id,
        i.invoice_number,
        i.status,
        i.sub_total,
        to_char(i.issue_date, 'YYYY-MM') AS issue_month,
        c.name AS contact_name,
        l.client_id
      FROM xero_ar_invoices i
      LEFT JOIN xero_contacts c
        ON c.xero_contact_id = i.xero_contact_id
      LEFT JOIN xero_contact_links l
        ON l.xero_contact_key = i.xero_contact_id
      WHERE to_char(i.issue_date, 'YYYY-MM') >= ${from}
        AND to_char(i.issue_date, 'YYYY-MM') < ${to}
        AND NOT EXISTS (
          SELECT 1
          FROM finance_billing_records r
          WHERE r.matched_xero_invoice_id = i.xero_invoice_id
            AND coalesce(r.invoice_key, '') NOT LIKE 'xero:%'
        )
    `),
  ])

  const plans: PlanExpectedRow[] = rowsOf<PlanSql>(planRows).map((row) => ({
    invoiceKey: row.invoice_key,
    billingMonth: (row.billing_month ?? "").slice(0, 7),
    clientName: row.client_name ?? "",
    clientsId: intOrNull(row.clients_id),
    mbaNumber: row.mba_number ?? "",
    campaignName: row.campaign_name ?? "",
    billingType: row.billing_type ?? "",
    approvedAmountCents: intOrNull(row.approved_amount_cents),
    scheduleCents: row.total == null ? null : centsFromDollars(row.total),
    billedAmountCents: intOrNull(row.billed_amount_cents),
    matchedXeroInvoiceId: row.matched_xero_invoice_id,
    xeroMatchResolution: row.xero_match_resolution,
    invoiceNumber: row.invoice_number,
    xeroStatus: row.status,
    subTotalCents: centsFromDollars(row.sub_total),
  }))

  const invoices: UnmatchedInvoiceRow[] = rowsOf<InvoiceSql>(invoiceRows).flatMap((row) => {
    if (!row.xero_invoice_id) return []
    return [
      {
        xeroInvoiceId: row.xero_invoice_id,
        invoiceNumber: row.invoice_number,
        status: row.status,
        subTotalCents: centsFromDollars(row.sub_total),
        issueMonth: row.issue_month,
        contactName: row.contact_name ?? "",
        clientId: intOrNull(row.client_id),
      },
    ]
  })

  return buildInvoicedVsExpected({ ...filters, plans, invoices })
}
