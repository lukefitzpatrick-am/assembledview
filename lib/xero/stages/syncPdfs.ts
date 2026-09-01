/**
 * Stage c: sync_pdfs — FY26+ AR/AP rows missing a Blob-backed pdf_file → Vercel Blob.
 * AP branch verified against XanoScript: identical to AR except table +
 * exception reason prefix ("AP PDF fetch failed:" vs "AR PDF fetch failed:").
 *
 * Default batch size is 50 (`PDF_BATCH_SIZE`). Override with env
 * `XERO_PDF_BATCH_SIZE` (positive integer) so a catch-up run can be sized
 * without a code change.
 */

import { put } from "@vercel/blob"
import { sql } from "drizzle-orm"

import { db } from "@/db"

import { upsertExceptionByInvoiceId } from "../applyMatchMba"
import { getXeroAccessToken, xeroApiRequest } from "../client"
import { rowsOf } from "../dbRows"

/** Default rows processed per stage run. Override via `XERO_PDF_BATCH_SIZE`. */
export const PDF_BATCH_SIZE = 50
export const PDF_BATCH_SIZE_ENV = "XERO_PDF_BATCH_SIZE"

/** Cap HTTP 429 retries per invoice (initial fetch + this many-1 waits). */
export const PDF_429_MAX_ATTEMPTS = 5
export const PDF_429_BASE_DELAY_MS = 1000
/** Ceiling on each 429 sleep (Retry-After or exponential). Four sleeps ≤ 60s. */
export const PDF_429_MAX_DELAY_MS = 15_000
/** Break the row loop and return cleanly before the cron's 300s maxDuration. */
export const PDF_STAGE_BUDGET_MS = 90_000

/**
 * Xano ETL left pdf_file as a non-null empty stub:
 * {"meta":{},"mime":"","name":"","path":"","size":0,"type":"","access":"public"}
 * jsonb `? 'url'` is the correct pending predicate: a Blob-backed file always
 * has a `url` key; the stub never does. `pdf_file IS NULL` only matches
 * never-touched rows and would permanently skip the stubs.
 */
export const XANO_EMPTY_PDF_STUB = {
  meta: {},
  mime: "",
  name: "",
  path: "",
  size: 0,
  type: "",
  access: "public",
} as const

export const PDF_PENDING_WHERE =
  "(pdf_file IS NULL OR NOT (pdf_file ? 'url')) AND issue_date >= '2025-07-01'"

export type SyncPdfsResult = {
  stage: "sync_pdfs"
  ok: boolean
  error?: string
  attempts: number
  processed: number
  ar_pending_seen: number
  ap_pending_seen: number
}

export type PendingPdfRow = {
  xero_invoice_id: string
  invoice_number: string | null
  reference_raw: string | null
  issue_date: string | null
}

export type PdfBlobMeta = {
  url: string
  pathname: string
  filename: string
}

export type PdfExceptionArgs = {
  xeroInvoiceId: string
  invoiceNumber: string | null
  reference: string | null
  issueDate: string | null
  reason: string
  rawJson: unknown
}

/**
 * Row-level mirror of `pdf_file IS NULL OR NOT (pdf_file ? 'url')`.
 * jsonb `?` means "object contains this key".
 */
export function pdfFileNeedsSync(pdfFile: unknown): boolean {
  if (pdfFile == null) return true
  if (typeof pdfFile !== "object" || Array.isArray(pdfFile)) return true
  return !Object.prototype.hasOwnProperty.call(pdfFile, "url")
}

export function resolvePdfBatchSize(
  override?: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override)
  }
  const raw = env[PDF_BATCH_SIZE_ENV]
  if (raw != null && raw.trim() !== "") {
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  return PDF_BATCH_SIZE
}

export function parseRetryAfterMs(
  headers: Headers,
  nowMs: number = Date.now(),
): number | null {
  const raw = headers.get("Retry-After")
  if (raw == null || raw.trim() === "") return null
  const trimmed = raw.trim()
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.max(0, Number(trimmed) * 1000)
  }
  const asDate = Date.parse(trimmed)
  if (Number.isNaN(asDate)) return null
  return Math.max(0, asDate - nowMs)
}

export function delayMsFor429(
  headers: Headers,
  attempt: number,
  random: () => number = Math.random,
  nowMs: number = Date.now(),
): number {
  const retryAfter = parseRetryAfterMs(headers, nowMs)
  const uncapped =
    retryAfter != null
      ? retryAfter
      : PDF_429_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1) +
        Math.floor(random() * PDF_429_BASE_DELAY_MS)
  return Math.min(uncapped, PDF_429_MAX_DELAY_MS)
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function attemptLabel(attempts: number): string {
  return `${attempts} attempt${attempts === 1 ? "" : "s"}`
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
): Promise<PdfBlobMeta> {
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

async function defaultPersistPdfFile(
  table: "xero_ar_invoices" | "xero_ap_bills",
  xeroInvoiceId: string,
  pdfFile: PdfBlobMeta,
): Promise<void> {
  const payload = JSON.stringify(pdfFile)
  if (table === "xero_ar_invoices") {
    await db.execute(sql`
      UPDATE xero_ar_invoices
      SET pdf_file = ${payload}::jsonb
      WHERE xero_invoice_id = ${xeroInvoiceId}
    `)
  } else {
    await db.execute(sql`
      UPDATE xero_ap_bills
      SET pdf_file = ${payload}::jsonb
      WHERE xero_invoice_id = ${xeroInvoiceId}
    `)
  }
}

async function defaultListPending(
  table: "xero_ar_invoices" | "xero_ap_bills",
): Promise<PendingPdfRow[]> {
  // Xano stub shape (see XANO_EMPTY_PDF_STUB): non-null, no `url` key.
  // `? 'url'` is the pending test — IS NULL alone skips every migrated stub.
  const result = await db.execute(sql`
    SELECT xero_invoice_id, invoice_number, reference_raw, issue_date::text AS issue_date
    FROM ${sql.raw(table)}
    WHERE ${sql.raw(PDF_PENDING_WHERE)}
    ORDER BY id ASC
  `)
  return rowsOf<PendingPdfRow>(result)
}

async function safeRecordException(
  record: (args: PdfExceptionArgs) => Promise<void>,
  args: PdfExceptionArgs,
): Promise<void> {
  try {
    await record(args)
  } catch {
    // Never let exception-row I/O fail the PDF stage.
  }
}

async function fetchAndAttachPdf(args: {
  row: PendingPdfRow
  accessToken: string
  kind: "AR" | "AP"
  table: "xero_ar_invoices" | "xero_ap_bills"
  fetchImpl: typeof fetch
  sleep: (ms: number) => Promise<void>
  random: () => number
  putPdfBlob: (
    invoiceNumber: string | null,
    xeroInvoiceId: string,
    bytes: Buffer,
  ) => Promise<PdfBlobMeta>
  persistPdfFile: (
    table: "xero_ar_invoices" | "xero_ap_bills",
    xeroInvoiceId: string,
    pdfFile: PdfBlobMeta,
  ) => Promise<void>
  recordException: (args: PdfExceptionArgs) => Promise<void>
}): Promise<boolean> {
  const {
    row,
    accessToken,
    kind,
    table,
    fetchImpl,
    sleep,
    random,
    putPdfBlob,
    persistPdfFile,
    recordException,
  } = args
  let attempts = 0
  try {
    let api: Awaited<ReturnType<typeof xeroApiRequest>> | undefined
    while (true) {
      attempts++
      api = await xeroApiRequest({
        accessToken,
        path: `/Invoices/${row.xero_invoice_id}`,
        accept: "application/pdf",
        fetchImpl,
      })
      if (api.status !== 429 || attempts >= PDF_429_MAX_ATTEMPTS) break
      await sleep(delayMsFor429(api.headers, attempts, random))
    }
    const buf = api!.body as ArrayBuffer
    const contentType = api!.headers.get("content-type")
    if (api!.status >= 400 || !isPdfBuffer(buf, contentType)) {
      await safeRecordException(recordException, {
        xeroInvoiceId: row.xero_invoice_id,
        invoiceNumber: row.invoice_number,
        reference: row.reference_raw,
        issueDate: row.issue_date,
        reason: `pdf status ${api!.status}: ${Buffer.from(buf.slice(0, 300)).toString("utf8")} after ${attemptLabel(attempts)}`,
        rawJson: null,
      })
      return false
    }
    const pdfFile = await putPdfBlob(
      row.invoice_number,
      row.xero_invoice_id,
      Buffer.from(buf),
    )
    await persistPdfFile(table, row.xero_invoice_id, pdfFile)
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await safeRecordException(recordException, {
      xeroInvoiceId: row.xero_invoice_id,
      invoiceNumber: row.invoice_number,
      reference: row.reference_raw,
      issueDate: row.issue_date,
      reason: `${kind} PDF fetch failed: ${msg} after ${attemptLabel(attempts)}`,
      rawJson: null,
    })
    return false
  }
}

export async function stageSyncPdfs(opts?: {
  fetchImpl?: typeof fetch
  batchSize?: number
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  now?: () => number
  getAccessToken?: (fetchImpl: typeof fetch) => Promise<string>
  listPending?: (kind: "AR" | "AP") => Promise<PendingPdfRow[]>
  putPdfBlob?: (
    invoiceNumber: string | null,
    xeroInvoiceId: string,
    bytes: Buffer,
  ) => Promise<PdfBlobMeta>
  persistPdfFile?: (
    table: "xero_ar_invoices" | "xero_ap_bills",
    xeroInvoiceId: string,
    pdfFile: PdfBlobMeta,
  ) => Promise<void>
  recordException?: (args: PdfExceptionArgs) => Promise<void>
}): Promise<SyncPdfsResult> {
  const batchSize = resolvePdfBatchSize(opts?.batchSize)
  const fetchImpl = opts?.fetchImpl ?? fetch
  const sleep = opts?.sleep ?? sleepMs
  const random = opts?.random ?? Math.random
  const now = opts?.now ?? Date.now
  const startedAt = now()
  const getToken = opts?.getAccessToken ?? getXeroAccessToken
  const listPending =
    opts?.listPending ??
    (async (kind: "AR" | "AP") =>
      defaultListPending(kind === "AR" ? "xero_ar_invoices" : "xero_ap_bills"))
  const putPdfBlob = opts?.putPdfBlob ?? storePdfBlob
  const persistPdfFile = opts?.persistPdfFile ?? defaultPersistPdfFile
  const recordException = opts?.recordException ?? upsertExceptionByInvoiceId
  let attempts = 0
  let done = 0

  try {
    const accessToken = await getToken(fetchImpl)

    const arPending = await listPending("AR")
    const apPending = await listPending("AP")

    const attach = async (
      row: PendingPdfRow,
      kind: "AR" | "AP",
      table: "xero_ar_invoices" | "xero_ap_bills",
    ) => {
      try {
        return await fetchAndAttachPdf({
          row,
          accessToken,
          kind,
          table,
          fetchImpl,
          sleep,
          random,
          putPdfBlob,
          persistPdfFile,
          recordException,
        })
      } catch {
        // A single invoice must never fail the stage (1,207+ pending rows).
        return false
      }
    }

    for (const row of arPending) {
      if (now() - startedAt >= PDF_STAGE_BUDGET_MS) break
      if (attempts >= batchSize) break
      attempts++
      if (await attach(row, "AR", "xero_ar_invoices")) done++
    }

    for (const row of apPending) {
      if (now() - startedAt >= PDF_STAGE_BUDGET_MS) break
      if (attempts >= batchSize) break
      attempts++
      if (await attach(row, "AP", "xero_ap_bills")) done++
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
