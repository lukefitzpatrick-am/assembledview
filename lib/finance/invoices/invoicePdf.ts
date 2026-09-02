import { BlobNotFoundError } from "@vercel/blob"
import { sql } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"

import { getDb } from "@/db"
import {
  assertClientAccess,
  type ClientAccess,
} from "@/lib/auth/assertClientAccess"
import { getPrivateBlob } from "@/lib/creative/getPrivateBlob"
import { getUserRoles } from "@/lib/rbac"
import { loadContactLinks } from "@/lib/xero/contactLinks"
import { rowsOf } from "@/lib/xero/dbRows"
import {
  resolveClientFromContact,
  type AliasRow,
  type ClientRow,
  type ResolvedClient,
} from "@/lib/xero/normalizeContact"

import { apInvoicePdfPath, arInvoicePdfPath } from "./invoicePdfPaths"

export { apInvoicePdfPath, arInvoicePdfPath }

export const PDF_NOT_AVAILABLE = {
  error: "not_found",
  code: "PDF_NOT_AVAILABLE",
} as const

export type InvoicePdfRecord = {
  xeroInvoiceId: string
  invoiceNumber: string | null
  pdfFile: unknown
  xeroContactId: string | null
  contactName: string | null
}

export type InvoicePdfBlobResult = {
  statusCode?: number
  stream?: ReadableStream | null
  blob?: { contentType?: string | null }
}

export type ServeInvoicePdfDeps = {
  getSession: (request: NextRequest) => Promise<{ user: unknown } | null>
  getUserRoles: (user: unknown) => string[]
  loadInvoice: (xeroInvoiceId: string) => Promise<InvoicePdfRecord | null>
  resolveClient: (record: InvoicePdfRecord) => Promise<ResolvedClient>
  assertClientAccess: (request: NextRequest, clientId: number) => Promise<ClientAccess>
  getPrivateBlob: (urlOrPathname: string) => Promise<InvoicePdfBlobResult | null>
}

function pdfFileObject(pdfFile: unknown): Record<string, unknown> | null {
  if (pdfFile == null) return null
  let value: unknown = pdfFile
  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** Prefer Blob pathname; never treat a Xano stub (no `url` key) as attached. */
export function invoicePdfBlobTarget(pdfFile: unknown): string | null {
  const obj = pdfFileObject(pdfFile)
  if (!obj || !Object.prototype.hasOwnProperty.call(obj, "url")) return null
  const pathname = obj.pathname
  if (typeof pathname === "string" && pathname.trim()) return pathname.trim()
  const url = obj.url
  if (typeof url === "string" && url.trim()) return url.trim()
  return null
}

export function invoicePdfDispositionFilename(invoiceNumber: string | null): string {
  const raw = (invoiceNumber ?? "").trim() || "invoice"
  const withExt = /\.pdf$/i.test(raw) ? raw : `${raw}.pdf`
  return withExt.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function pdfNotFound(): NextResponse {
  return NextResponse.json(PDF_NOT_AVAILABLE, { status: 404 })
}

function forbidden(): NextResponse {
  return NextResponse.json({ error: "forbidden" }, { status: 403 })
}

function unauthorised(): NextResponse {
  return NextResponse.json({ error: "unauthorised" }, { status: 401 })
}

function mapRow(row: {
  xero_invoice_id: string | null
  invoice_number: string | null
  pdf_file: unknown
  xero_contact_id: string | null
  contact_name: string | null
}): InvoicePdfRecord | null {
  const id = row.xero_invoice_id?.trim()
  if (!id) return null
  return {
    xeroInvoiceId: id,
    invoiceNumber: row.invoice_number,
    pdfFile: row.pdf_file,
    xeroContactId: row.xero_contact_id,
    contactName: row.contact_name,
  }
}

async function loadArInvoice(xeroInvoiceId: string): Promise<InvoicePdfRecord | null> {
  const db = getDb()
  const rows = await rowsOf<{
    xero_invoice_id: string | null
    invoice_number: string | null
    pdf_file: unknown
    xero_contact_id: string | null
    contact_name: string | null
  }>(
    await db.execute(sql`
      SELECT
        i.xero_invoice_id,
        i.invoice_number,
        i.pdf_file,
        i.xero_contact_id,
        c.name AS contact_name
      FROM xero_ar_invoices i
      LEFT JOIN xero_contacts c ON c.xero_contact_id = i.xero_contact_id
      WHERE i.xero_invoice_id = ${xeroInvoiceId}
      LIMIT 1
    `),
  )
  return rows[0] ? mapRow(rows[0]) : null
}

async function loadApInvoice(xeroInvoiceId: string): Promise<InvoicePdfRecord | null> {
  const db = getDb()
  const rows = await rowsOf<{
    xero_invoice_id: string | null
    invoice_number: string | null
    pdf_file: unknown
    xero_contact_id: string | null
    contact_name: string | null
  }>(
    await db.execute(sql`
      SELECT
        b.xero_invoice_id,
        b.invoice_number,
        b.pdf_file,
        b.xero_contact_id,
        c.name AS contact_name
      FROM xero_ap_bills b
      LEFT JOIN xero_contacts c ON c.xero_contact_id = b.xero_contact_id
      WHERE b.xero_invoice_id = ${xeroInvoiceId}
      LIMIT 1
    `),
  )
  return rows[0] ? mapRow(rows[0]) : null
}

async function resolveClientForInvoice(record: InvoicePdfRecord): Promise<ResolvedClient> {
  const db = getDb()
  const [clients, aliases, links] = await Promise.all([
    rowsOf<{
      id: number
      mp_client_name: string | null
      payment_days: number | null
      payment_terms: string | null
    }>(await db.execute(sql`SELECT id, mp_client_name, payment_days, payment_terms FROM clients`)),
    rowsOf<{ contact_key: string; client_id: number }>(
      await db
        .execute(sql`SELECT contact_key, client_id FROM xero_client_aliases`)
        .catch(() => [] as { contact_key: string; client_id: number }[]),
    ),
    loadContactLinks(),
  ])
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
  return resolveClientFromContact(record.contactName ?? "", clientRows, aliasRows, {
    xeroContactId: record.xeroContactId,
    links,
  })
}

async function defaultSession(
  request: NextRequest,
): Promise<{ user: unknown } | null> {
  const { auth0 } = await import("@/lib/auth0")
  const session = await auth0.getSession(request)
  return session?.user ? { user: session.user } : null
}

function arDeps(overrides?: Partial<ServeInvoicePdfDeps>): ServeInvoicePdfDeps {
  return {
    getSession: defaultSession,
    getUserRoles: (user) => getUserRoles(user as Parameters<typeof getUserRoles>[0]),
    loadInvoice: loadArInvoice,
    resolveClient: resolveClientForInvoice,
    assertClientAccess,
    getPrivateBlob,
    ...overrides,
  }
}

function apDeps(overrides?: Partial<ServeInvoicePdfDeps>): ServeInvoicePdfDeps {
  return {
    getSession: defaultSession,
    getUserRoles: (user) => getUserRoles(user as Parameters<typeof getUserRoles>[0]),
    loadInvoice: loadApInvoice,
    resolveClient: resolveClientForInvoice,
    assertClientAccess,
    getPrivateBlob,
    ...overrides,
  }
}

async function streamPdf(
  record: InvoicePdfRecord,
  getBlob: ServeInvoicePdfDeps["getPrivateBlob"],
): Promise<NextResponse> {
  const target = invoicePdfBlobTarget(record.pdfFile)
  if (!target) return pdfNotFound()

  try {
    const blobResult = await getBlob(target)
    if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
      return pdfNotFound()
    }
    const filename = invoicePdfDispositionFilename(record.invoiceNumber)
    return new NextResponse(blobResult.stream, {
      status: 200,
      headers: {
        "Content-Type": blobResult.blob?.contentType || "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    if (error instanceof BlobNotFoundError) return pdfNotFound()
    throw error
  }
}

export async function serveArInvoicePdf(
  request: NextRequest,
  xeroInvoiceId: string,
  deps?: Partial<ServeInvoicePdfDeps>,
): Promise<NextResponse> {
  const d = arDeps(deps)
  const session = await d.getSession(request)
  if (!session?.user) return unauthorised()

  const id = xeroInvoiceId.trim()
  if (!id) return pdfNotFound()

  const record = await d.loadInvoice(id)
  if (!record || !invoicePdfBlobTarget(record.pdfFile)) return pdfNotFound()

  const roles = d.getUserRoles(session.user)
  if (roles.includes("admin")) {
    return streamPdf(record, d.getPrivateBlob)
  }
  if (!roles.includes("client")) return forbidden()

  const resolved = await d.resolveClient(record)
  if (!resolved.resolved || resolved.clientsId <= 0) return forbidden()

  const access = await d.assertClientAccess(request, resolved.clientsId)
  if (!access.ok) return access.response

  return streamPdf(record, d.getPrivateBlob)
}

export async function serveApInvoicePdf(
  request: NextRequest,
  xeroInvoiceId: string,
  deps?: Partial<ServeInvoicePdfDeps>,
): Promise<NextResponse> {
  const d = apDeps(deps)
  const session = await d.getSession(request)
  if (!session?.user) return unauthorised()

  const roles = d.getUserRoles(session.user)
  if (!roles.includes("admin")) return forbidden()

  const id = xeroInvoiceId.trim()
  if (!id) return pdfNotFound()

  const record = await d.loadInvoice(id)
  if (!record || !invoicePdfBlobTarget(record.pdfFile)) return pdfNotFound()

  return streamPdf(record, d.getPrivateBlob)
}
