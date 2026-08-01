/**
 * Stage c: sync_pdfs — FY26+ AR/AP rows missing pdf_file → Vercel Blob.
 * AP branch verified against XanoScript: identical to AR except table +
 * exception reason prefix ("AP PDF fetch failed:" vs "AR PDF fetch failed:").
 */

import { put } from "@vercel/blob"
import { sql } from "drizzle-orm"

import { db } from "@/db"

import { upsertExceptionByInvoiceId } from "../applyMatchMba"
import { getXeroAccessToken, xeroApiRequest } from "../client"
import { rowsOf } from "../dbRows"

export const PDF_BATCH_SIZE = 50

export type SyncPdfsResult = {
  stage: "sync_pdfs"
  ok: boolean
  error?: string
  attempts: number
  processed: number
  ar_pending_seen: number
  ap_pending_seen: number
}

type PendingRow = {
  xero_invoice_id: string
  invoice_number: string | null
  reference_raw: string | null
  issue_date: string | null
}

function isPdfBuffer(buf: ArrayBuffer, contentType: string | null): boolean {
  const head = Buffer.from(buf.slice(0, 4)).toString("utf8")
  if (head === "%PDF") return true
  return (contentType ?? "").includes("application/pdf")
}

async function storePdfBlob(
  invoiceNumber: string | null,
  xeroInvoiceId: string,
  bytes: Buffer,
): Promise<{ url: string; pathname: string; filename: string }> {
  const filename = `${invoiceNumber || xeroInvoiceId}.pdf`
  const blob = await put(`xero-invoices/${xeroInvoiceId}/${filename}`, bytes, {
    access: "private",
    contentType: "application/pdf",
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  return {
    url: blob.url,
    pathname: blob.pathname,
    filename,
  }
}

async function fetchAndAttachPdf(args: {
  row: PendingRow
  accessToken: string
  kind: "AR" | "AP"
  table: "xero_ar_invoices" | "xero_ap_bills"
  fetchImpl: typeof fetch
}): Promise<boolean> {
  const { row, accessToken, kind, table, fetchImpl } = args
  try {
    const api = await xeroApiRequest({
      accessToken,
      path: `/Invoices/${row.xero_invoice_id}`,
      accept: "application/pdf",
      fetchImpl,
    })
    const buf = api.body as ArrayBuffer
    const contentType = api.headers.get("content-type")
    if (api.status >= 400 || !isPdfBuffer(buf, contentType)) {
      await upsertExceptionByInvoiceId({
        xeroInvoiceId: row.xero_invoice_id,
        invoiceNumber: row.invoice_number,
        reference: row.reference_raw,
        issueDate: row.issue_date,
        reason: `pdf status ${api.status}: ${Buffer.from(buf.slice(0, 300)).toString("utf8")}`,
        rawJson: null,
      })
      return false
    }
    const pdfFile = await storePdfBlob(
      row.invoice_number,
      row.xero_invoice_id,
      Buffer.from(buf),
    )
    if (table === "xero_ar_invoices") {
      await db.execute(sql`
        UPDATE xero_ar_invoices
        SET pdf_file = ${JSON.stringify(pdfFile)}::jsonb
        WHERE xero_invoice_id = ${row.xero_invoice_id}
      `)
    } else {
      await db.execute(sql`
        UPDATE xero_ap_bills
        SET pdf_file = ${JSON.stringify(pdfFile)}::jsonb
        WHERE xero_invoice_id = ${row.xero_invoice_id}
      `)
    }
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await upsertExceptionByInvoiceId({
      xeroInvoiceId: row.xero_invoice_id,
      invoiceNumber: row.invoice_number,
      reference: row.reference_raw,
      issueDate: row.issue_date,
      reason: `${kind} PDF fetch failed: ${msg}`,
      rawJson: null,
    })
    return false
  }
}

export async function stageSyncPdfs(opts?: {
  fetchImpl?: typeof fetch
  batchSize?: number
}): Promise<SyncPdfsResult> {
  const batchSize = opts?.batchSize ?? PDF_BATCH_SIZE
  const fetchImpl = opts?.fetchImpl ?? fetch
  let attempts = 0
  let done = 0

  try {
    const accessToken = await getXeroAccessToken(fetchImpl)

    const arPending = rowsOf<PendingRow>(
      await db.execute(sql`
      SELECT xero_invoice_id, invoice_number, reference_raw, issue_date::text AS issue_date
      FROM xero_ar_invoices
      WHERE pdf_file IS NULL AND issue_date >= '2025-07-01'
      ORDER BY id ASC
    `),
    )

    const apPending = rowsOf<PendingRow>(
      await db.execute(sql`
      SELECT xero_invoice_id, invoice_number, reference_raw, issue_date::text AS issue_date
      FROM xero_ap_bills
      WHERE pdf_file IS NULL AND issue_date >= '2025-07-01'
      ORDER BY id ASC
    `),
    )

    for (const row of arPending) {
      if (attempts >= batchSize) break
      attempts++
      if (
        await fetchAndAttachPdf({
          row,
          accessToken,
          kind: "AR",
          table: "xero_ar_invoices",
          fetchImpl,
        })
      ) {
        done++
      }
    }

    for (const row of apPending) {
      if (attempts >= batchSize) break
      attempts++
      if (
        await fetchAndAttachPdf({
          row,
          accessToken,
          kind: "AP",
          table: "xero_ap_bills",
          fetchImpl,
        })
      ) {
        done++
      }
    }

    return {
      stage: "sync_pdfs",
      ok: true,
      attempts,
      processed: done,
      ar_pending_seen: arPending.length,
      ap_pending_seen: apPending.length,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      stage: "sync_pdfs",
      ok: false,
      error: msg,
      attempts,
      processed: done,
      ar_pending_seen: 0,
      ap_pending_seen: 0,
    }
  }
}
