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
import { rowsOf } from "@/lib/xero/dbRows"
import { type ResolvedClient } from "@/lib/xero/normalizeContact"

import { apInvoicePdfPath, arInvoicePdfPath } from "./invoicePdfPaths"
import { resolveInvoiceClients } from "./resolveInvoiceClient"

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
  /** AR only. AP bills have no MBA column. */
  mbaNumber: string | null
}

/**
 * Contact links win. When the contact is unresolved, the MBA's client is used
 * if media_plan_masters.client_id's mbaidentifier prefixes the MBA number.
 */
export function mergeInvoiceClient(
  contact: ResolvedClient,
  mba: ResolvedClient | null,
): ResolvedClient {
  if (contact.resolved && contact.clientsId > 0) return contact
  if (mba && mba.resolved && mba.clientsId > 0) return mba
  return contact
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
  mba_number?: string | null
}): InvoicePdfRecord | null {
  const id = row.xero_invoice_id?.trim()
  if (!id) return null
  return {
    xeroInvoiceId: id,
    invoiceNumber: row.invoice_number,
    pdfFile: row.pdf_file,
    xeroContactId: row.xero_contact_id,
    contactName: row.contact_name,
    mbaNumber: row.mba_number?.trim() || null,
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
    mba_number: string | null
  }>(
    await db.execute(sql`
      SELECT
        i.xero_invoice_id,
        i.invoice_number,
        i.pdf_file,
        i.xero_contact_id,
        c.name AS contact_name,
        i.mba_number
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

function resolvedFromHit(
  clientId: number | null,
  contactName: string,
): ResolvedClient {
  if (clientId == null || clientId <= 0) {
    return {
      clientsId: 0,
      clientName: contactName,
      paymentDays: 14,
      paymentTerms: "",
      resolved: false,
    }
  }
  return {
    clientsId: clientId,
    clientName: contactName,
    paymentDays: 14,
    paymentTerms: "",
    resolved: true,
  }
}

/** Client-role PDF access. Admins never call this. Strict: link, alias, or MBA. */
async function resolveClientForInvoice(record: InvoicePdfRecord): Promise<ResolvedClient> {
  const [hit] = await resolveInvoiceClients(
    [
      {
        contactName: record.contactName,
        xeroContactId: record.xeroContactId,
        mbaNumber: record.mbaNumber,
      },
    ],
    { mode: "strict" },
  )
  return resolvedFromHit(hit?.clientId ?? null, record.contactName ?? "")
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
