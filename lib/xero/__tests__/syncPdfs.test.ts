import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  PDF_429_MAX_ATTEMPTS,
  PDF_PENDING_WHERE,
  XANO_EMPTY_PDF_STUB,
  pdfFileNeedsSync,
  stageSyncPdfs,
  type PendingPdfRow,
} from "../stages/syncPdfs"

const STUB_ROW: PendingPdfRow = {
  xero_invoice_id: "inv-stub",
  invoice_number: "INV-STUB",
  reference_raw: "HEMA001",
  issue_date: "2025-08-01",
}

const OK_ROW: PendingPdfRow = {
  xero_invoice_id: "inv-ok",
  invoice_number: "INV-OK",
  reference_raw: "BOSS006",
  issue_date: "2025-09-01",
}

const BLOB_PDF = {
  url: "https://blob.vercel-storage.com/xero-invoices/inv-ok/INV-OK.pdf",
  pathname: "xero-invoices/inv-ok/INV-OK.pdf",
  filename: "INV-OK.pdf",
}

function pdfOkResponse(): Response {
  return new Response("%PDF-1.4 fixture", {
    status: 200,
    headers: { "content-type": "application/pdf" },
  })
}

function statusResponse(status: number, body: string, headers?: HeadersInit): Response {
  return new Response(body, { status, headers })
}

describe("pdf pending selector", () => {
  it("selects a row whose pdf_file is the empty Xano stub", () => {
    assert.equal(pdfFileNeedsSync(XANO_EMPTY_PDF_STUB), true)
  })

  it("does not select a row whose pdf_file already has a url key", () => {
    assert.equal(pdfFileNeedsSync(BLOB_PDF), false)
  })

  it("selects a row whose pdf_file is null", () => {
    assert.equal(pdfFileNeedsSync(null), true)
  })

  it("uses jsonb ? url (not IS NULL alone) so Xano stubs are eligible", () => {
    assert.equal(
      PDF_PENDING_WHERE,
      "(pdf_file IS NULL OR NOT (pdf_file ? 'url')) AND issue_date >= '2025-07-01'",
    )
  })
})

describe("429 backoff", () => {
  it("honours Retry-After and gives up after the cap", async () => {
    const sleeps: number[] = []
    const reasons: string[] = []
    let pdfFetches = 0

    const result = await stageSyncPdfs({
      batchSize: 1,
      getAccessToken: async () => "tok",
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      listPending: async (kind) => (kind === "AR" ? [STUB_ROW] : []),
      recordException: async (args) => {
        reasons.push(args.reason)
      },
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes("/Invoices/")) {
          pdfFetches++
          return statusResponse(429, "rate limited", { "Retry-After": "7" })
        }
        throw new Error(`unexpected fetch ${url}`)
      }) as typeof fetch,
    })

    assert.equal(pdfFetches, PDF_429_MAX_ATTEMPTS)
    assert.equal(sleeps.length, PDF_429_MAX_ATTEMPTS - 1)
    assert.ok(sleeps.every((ms) => ms === 7000), `Retry-After 7s → 7000ms, got ${sleeps.join(",")}`)
    assert.equal(result.ok, true)
    assert.equal(result.processed, 0)
    assert.equal(reasons.length, 1)
    assert.match(reasons[0]!, /pdf status 429/)
    assert.match(reasons[0]!, new RegExp(String(PDF_429_MAX_ATTEMPTS)))
  })
})

describe("per-row PDF failure", () => {
  it("does not stop the batch when one row fails", async () => {
    const persisted: string[] = []
    const exceptions: string[] = []

    const result = await stageSyncPdfs({
      batchSize: 10,
      getAccessToken: async () => "tok",
      sleep: async () => {
        throw new Error("should not sleep on non-429")
      },
      listPending: async (kind) => (kind === "AR" ? [STUB_ROW, OK_ROW] : []),
      putPdfBlob: async () => BLOB_PDF,
      persistPdfFile: async (_table, xeroInvoiceId) => {
        persisted.push(xeroInvoiceId)
      },
      recordException: async (args) => {
        exceptions.push(args.xeroInvoiceId)
      },
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes("inv-stub")) return statusResponse(500, "boom")
        if (url.includes("inv-ok")) return pdfOkResponse()
        throw new Error(`unexpected fetch ${url}`)
      }) as typeof fetch,
    })

    assert.equal(result.ok, true)
    assert.equal(result.attempts, 2)
    assert.equal(result.processed, 1)
    assert.deepEqual(persisted, ["inv-ok"])
    assert.deepEqual(exceptions, ["inv-stub"])
  })
})
