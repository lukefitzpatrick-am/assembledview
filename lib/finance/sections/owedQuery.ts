/**
 * Load live Xero AR into the CB-4 debtors ledger.
 *
 * Client identity is resolved in JS via CB-1 `resolveClientFromContact`
 * (links → unique name → alias). Do not FY-clip the default Owed view —
 * ageing is who owes us now, all open AUTHORISED invoices.
 */

import "server-only"

import { sql } from "drizzle-orm"

import { getDb } from "@/db"
import { auFyBoundsDateOnly } from "@/lib/dates/auFinancialYear"
import {
  buildOwedLedger,
  isOwedBucket,
  type OwedBucket,
  type OwedLedgerPayload,
  type OwedSourceInvoice,
} from "@/lib/finance/sections/owedLedger"
import { coerceDollars } from "@/lib/xero/money"
import { loadContactLinks } from "@/lib/xero/contactLinks"
import { rowsOf } from "@/lib/xero/dbRows"
import {
  resolveClientFromContact,
  type AliasRow,
  type ClientRow,
} from "@/lib/xero/normalizeContact"

export type OwedQuery = {
  fy?: number
  from?: string
  to?: string
  clientIds: number[]
  bucket: OwedBucket | null
  search: string
}

export type { OwedLedgerPayload }

type ArRow = {
  xero_invoice_id: string | null
  invoice_number: string | null
  reference_raw: string | null
  issue_date: string | null
  due_date: string | null
  status: string | null
  sub_total: unknown
  total: unknown
  amount_paid: unknown
  amount_due: unknown
  fully_paid_date: string | null
  pdf_file: unknown
  xero_contact_id: string | null
  contact_name: string | null
}

const YYYY_MM = /^\d{4}-\d{2}$/

export function normalizeOwedQuery(raw: {
  fy?: number
  from?: string
  to?: string
  clients?: number[]
  bucket?: string | null
  search?: string | null
}): OwedQuery {
  const from = raw.from?.trim() && YYYY_MM.test(raw.from.trim()) ? raw.from.trim() : undefined
  const to = raw.to?.trim() && YYYY_MM.test(raw.to.trim()) ? raw.to.trim() : undefined
  const bucketRaw = raw.bucket?.trim() ?? ""
  return {
    fy: raw.fy,
    from,
    to: from && to ? to : undefined,
    clientIds: [...new Set((raw.clients ?? []).filter((n) => Number.isFinite(n) && n > 0))],
    bucket: bucketRaw && isOwedBucket(bucketRaw) ? bucketRaw : null,
    search: raw.search?.trim() ?? "",
  }
}

function ymdFromPg(value: unknown): string | null {
  if (value == null) return null
  const s = typeof value === "string" ? value : String(value)
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s.trim())
  return m?.[1] ?? null
}

/** jsonb `? 'url'` — never return the URL itself (CB-6 will proxy the private blob). */
export function pdfAvailableFromJson(pdfFile: unknown): boolean {
  if (pdfFile == null) return false
  if (typeof pdfFile !== "object" || Array.isArray(pdfFile)) return false
  return Object.prototype.hasOwnProperty.call(pdfFile, "url")
}

export async function fetchOwedLedger(query: OwedQuery): Promise<OwedLedgerPayload> {
  const db = getDb()
  const fyBounds = query.fy != null ? auFyBoundsDateOnly(query.fy) : null
  const monthFrom = query.from
  const monthTo = query.to

  const [todayRow, ar, clients, aliases, links] = await Promise.all([
    rowsOf<{ sydney_today: string }>(
      await db.execute(
        sql`SELECT (timezone('Australia/Sydney', now()))::date::text AS sydney_today`
      )
    ),
    rowsOf<ArRow>(
      await db.execute(sql`
        SELECT
          i.xero_invoice_id,
          i.invoice_number,
          i.reference_raw,
          i.issue_date::text AS issue_date,
          i.due_date::text AS due_date,
          i.status,
          i.sub_total,
          i.total,
          i.amount_paid,
          i.amount_due,
          i.fully_paid_date::text AS fully_paid_date,
          i.pdf_file,
          i.xero_contact_id,
          c.name AS contact_name
        FROM xero_ar_invoices i
        LEFT JOIN xero_contacts c ON c.xero_contact_id = i.xero_contact_id
        WHERE upper(coalesce(i.status, '')) = 'AUTHORISED'
          AND coalesce(i.amount_due, 0)::numeric > 0
          ${
            fyBounds
              ? sql`AND i.issue_date >= ${fyBounds.start} AND i.issue_date <= ${fyBounds.end}`
              : sql``
          }
          ${
            monthFrom && monthTo
              ? sql`AND to_char(i.issue_date, 'YYYY-MM') >= ${monthFrom}
                    AND to_char(i.issue_date, 'YYYY-MM') <= ${monthTo}`
              : sql``
          }
      `)
    ),
    rowsOf<{
      id: number
      mp_client_name: string | null
      payment_days: number | null
      payment_terms: string | null
    }>(await db.execute(sql`SELECT id, mp_client_name, payment_days, payment_terms FROM clients`)),
    rowsOf<{ contact_key: string; client_id: number }>(
      await db
        .execute(sql`SELECT contact_key, client_id FROM xero_client_aliases`)
        .catch(() => [] as { contact_key: string; client_id: number }[])
    ),
    loadContactLinks(),
  ])

  const todayYmd = todayRow[0]?.sydney_today ?? new Date().toISOString().slice(0, 10)

  const clientRows: ClientRow[] = clients.map((c) => ({
    id: Number(c.id),
    mp_client_name: c.mp_client_name,
    payment_days: c.payment_days != null ? Number(c.payment_days) : null,
    payment_terms: c.payment_terms,
  }))
  const aliasRows: AliasRow[] = aliases.map((a) => ({
    contact_key: a.contact_key,
    client_id: Number(a.client_id),
  }))

  const sources: OwedSourceInvoice[] = ar.map((row) => {
    const contactId = row.xero_contact_id
    const contactName = row.contact_name ?? ""
    const resolved = resolveClientFromContact(contactName, clientRows, aliasRows, {
      xeroContactId: contactId,
      links,
    })
    return {
      id: String(row.xero_invoice_id ?? row.invoice_number ?? ""),
      invoiceNumber: row.invoice_number?.trim() || String(row.xero_invoice_id ?? "—"),
      reference: row.reference_raw?.trim() || null,
      issueDate: ymdFromPg(row.issue_date),
      dueDate: ymdFromPg(row.due_date),
      status: row.status ?? "",
      subTotal: coerceDollars(row.sub_total),
      totalIncGst: coerceDollars(row.total),
      amountPaid: coerceDollars(row.amount_paid),
      amountDue: coerceDollars(row.amount_due),
      fullyPaidDate: ymdFromPg(row.fully_paid_date),
      pdfAvailable: pdfAvailableFromJson(row.pdf_file),
      resolved: resolved.resolved,
      clientsId: resolved.resolved ? resolved.clientsId : null,
      clientName: resolved.resolved ? resolved.clientName : null,
      contactName: contactName.trim() || null,
    }
  })

  const ledger = buildOwedLedger(sources, {
    todayYmd,
    clients: query.clientIds,
    bucket: query.bucket,
    search: query.search,
  })

  return {
    ...ledger,
    asOf: todayYmd,
    scope: {
      fy: query.fy ?? null,
      from: query.from ?? null,
      to: query.to ?? null,
      clients: query.clientIds,
      bucket: query.bucket,
      search: query.search,
    },
  }
}
