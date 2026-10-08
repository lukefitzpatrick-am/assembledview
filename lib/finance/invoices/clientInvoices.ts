/**
 * FY26+ Xero AR invoices for one client.
 * Strict resolution only: contact link, alias, or MBA. A name match never qualifies.
 * `totalCents` is the Xero total, GST inclusive (`totalBasis: "inc_gst"`).
 */

import "server-only"

import { sql } from "drizzle-orm"

import { getDb } from "@/db"
import { sydneyCivilParts } from "@/lib/codex/quickAddParse"
import { daysOverdue } from "@/lib/finance/sections/owedLedger"
import { pdfAvailableFromJson } from "@/lib/finance/sections/owedQuery"
import { FY26_AR_START } from "@/lib/xero/contactLinks"
import { coerceDollars, dollarsToCents } from "@/lib/xero/money"
import { rowsOf } from "@/lib/xero/dbRows"

import { resolveInvoiceClients } from "./resolveInvoiceClient"

/** Server env. Unset or anything other than on / 1 / true stays off. */
export function isClientInvoicesEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = (env.CLIENT_INVOICES_ENABLED ?? "off").trim().toLowerCase()
  return v === "on" || v === "1" || v === "true"
}

const ALLOWED_STATUSES = new Set(["AUTHORISED", "PAID"])

export type ClientInvoiceState = "paid" | "due" | "overdue"

export type ClientInvoiceCandidate = {
  xeroInvoiceId: string
  invoiceNumber: string | null
  issueDate: string | null
  dueDate: string | null
  fullyPaidDate: string | null
  status: string
  total: unknown
  amountDue: unknown
  amountPaid: unknown
  mbaNumber: string | null
  pdfFile: unknown
  contactName: string | null
  xeroContactId: string | null
}

export type ClientInvoiceRow = {
  xeroInvoiceId: string
  invoiceNumber: string | null
  issueDate: string | null
  dueDate: string | null
  /** Xero `total`, GST inclusive. */
  totalCents: number
  amountDueCents: number
  amountPaidCents: number
  fullyPaidDate: string | null
  mbaNumber: string | null
  hasPdf: boolean
  state: ClientInvoiceState
  daysOverdue: number
}

export type ClientInvoiceSummary = {
  outstandingCents: number
  overdueCents: number
  overdueCount: number
  oldestOverdueDueDate: string | null
}

export type ClientInvoicesPayload = {
  /** Labels `totalCents` as GST inclusive. Amount due and amount paid are the Xero figures in cents. */
  totalBasis: "inc_gst"
  invoices: ClientInvoiceRow[]
  summary: ClientInvoiceSummary
}

function ymd(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim()
  if (!text) return null
  return text.slice(0, 10)
}

export function clientInvoiceState(
  status: string,
  amountDueCents: number,
  dueDate: string | null,
  todayYmd: string,
): { state: ClientInvoiceState; daysOverdue: number } {
  if (status.trim().toUpperCase() === "PAID") {
    return { state: "paid", daysOverdue: 0 }
  }
  const days = daysOverdue(dueDate, todayYmd)
  if (amountDueCents > 0 && days > 0) {
    return { state: "overdue", daysOverdue: days }
  }
  return { state: "due", daysOverdue: 0 }
}

function compareInvoices(a: ClientInvoiceRow, b: ClientInvoiceRow): number {
  const rank = (state: ClientInvoiceState) =>
    state === "overdue" ? 0 : state === "due" ? 1 : 2
  const group = rank(a.state) - rank(b.state)
  if (group !== 0) return group
  if (a.state === "paid") {
    return (b.issueDate ?? "").localeCompare(a.issueDate ?? "")
  }
  return (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99")
}

export function assembleClientInvoices(input: {
  rows: ClientInvoiceCandidate[]
  clientIds: Array<number | null>
  clientId: number
  todayYmd: string
}): ClientInvoicesPayload {
  const invoices: ClientInvoiceRow[] = []
  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i]!
    if (!ALLOWED_STATUSES.has(row.status.trim().toUpperCase())) continue
    if (input.clientIds[i] !== input.clientId) continue
    const amountDueCents = dollarsToCents(coerceDollars(row.amountDue))
    const dueDate = ymd(row.dueDate)
    const { state, daysOverdue: age } = clientInvoiceState(
      row.status,
      amountDueCents,
      dueDate,
      input.todayYmd,
    )
    invoices.push({
      xeroInvoiceId: row.xeroInvoiceId,
      invoiceNumber: row.invoiceNumber,
      issueDate: ymd(row.issueDate),
      dueDate,
      totalCents: dollarsToCents(coerceDollars(row.total)),
      amountDueCents,
      amountPaidCents: dollarsToCents(coerceDollars(row.amountPaid)),
      fullyPaidDate: ymd(row.fullyPaidDate),
      mbaNumber: row.mbaNumber?.trim() || null,
      hasPdf: pdfAvailableFromJson(row.pdfFile),
      state,
      daysOverdue: age,
    })
  }
  invoices.sort(compareInvoices)

  let outstandingCents = 0
  let overdueCents = 0
  let overdueCount = 0
  let oldestOverdueDueDate: string | null = null
  for (const invoice of invoices) {
    if (invoice.state === "paid") continue
    outstandingCents += invoice.amountDueCents
    if (invoice.state !== "overdue") continue
    overdueCents += invoice.amountDueCents
    overdueCount += 1
    if (
      invoice.dueDate &&
      (oldestOverdueDueDate == null || invoice.dueDate < oldestOverdueDueDate)
    ) {
      oldestOverdueDueDate = invoice.dueDate
    }
  }

  return {
    totalBasis: "inc_gst",
    invoices,
    summary: {
      outstandingCents,
      overdueCents,
      overdueCount,
      oldestOverdueDueDate,
    },
  }
}

type ArCandidateRow = {
  xero_invoice_id: string | null
  invoice_number: string | null
  issue_date: string | null
  due_date: string | null
  fully_paid_date: string | null
  status: string | null
  total: unknown
  amount_due: unknown
  amount_paid: unknown
  mba_number: string | null
  pdf_file: unknown
  contact_name: string | null
  xero_contact_id: string | null
}

export async function loadClientInvoicesForClient(
  clientId: number,
  options?: { todayYmd?: string },
): Promise<ClientInvoicesPayload> {
  const db = getDb()
  const [todayRows, invoiceRows] = await Promise.all([
    options?.todayYmd
      ? Promise.resolve([] as { sydney_today: string }[])
      : rowsOf<{ sydney_today: string }>(
          await db.execute(
            sql`SELECT (timezone('Australia/Sydney', now()))::date::text AS sydney_today`,
          ),
        ),
    rowsOf<ArCandidateRow>(
      await db.execute(sql`
        SELECT
          i.xero_invoice_id,
          i.invoice_number,
          i.issue_date::text AS issue_date,
          i.due_date::text AS due_date,
          i.fully_paid_date::text AS fully_paid_date,
          i.status,
          i.total,
          i.amount_due,
          i.amount_paid,
          i.mba_number,
          i.pdf_file,
          i.xero_contact_id,
          c.name AS contact_name
        FROM xero_ar_invoices i
        LEFT JOIN xero_contacts c ON c.xero_contact_id = i.xero_contact_id
        WHERE i.issue_date >= ${FY26_AR_START}
          AND upper(btrim(coalesce(i.status, ''))) IN ('AUTHORISED', 'PAID')
      `),
    ),
  ])

  const todayYmd =
    options?.todayYmd ??
    todayRows[0]?.sydney_today?.slice(0, 10) ??
    sydneyCivilParts(new Date()).ymd

  const candidates: ClientInvoiceCandidate[] = []
  for (const row of invoiceRows) {
    const id = row.xero_invoice_id?.trim()
    if (!id) continue
    candidates.push({
      xeroInvoiceId: id,
      invoiceNumber: row.invoice_number,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      fullyPaidDate: row.fully_paid_date,
      status: row.status ?? "",
      total: row.total,
      amountDue: row.amount_due,
      amountPaid: row.amount_paid,
      mbaNumber: row.mba_number,
      pdfFile: row.pdf_file,
      contactName: row.contact_name,
      xeroContactId: row.xero_contact_id,
    })
  }

  const resolved = await resolveInvoiceClients(
    candidates.map((row) => ({
      contactName: row.contactName,
      xeroContactId: row.xeroContactId,
      mbaNumber: row.mbaNumber,
    })),
    { mode: "strict" },
  )

  return assembleClientInvoices({
    rows: candidates,
    clientIds: resolved.map((hit) => hit?.clientId ?? null),
    clientId,
    todayYmd,
  })
}
