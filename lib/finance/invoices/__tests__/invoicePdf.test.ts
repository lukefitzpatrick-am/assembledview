import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { NextRequest, NextResponse } from "next/server"
import { BlobNotFoundError } from "@vercel/blob"

import { XANO_EMPTY_PDF_STUB } from "@/lib/xero/stages/syncPdfs"
import { pdfAvailableFromJson } from "@/lib/finance/sections/owedQuery"
import {
  apInvoicePdfPath,
  arInvoicePdfPath,
  invoicePdfBlobTarget,
  invoicePdfDispositionFilename,
  PDF_NOT_AVAILABLE,
  serveApInvoicePdf,
  serveArInvoicePdf,
  type InvoicePdfRecord,
  type ServeInvoicePdfDeps,
} from "../invoicePdf"

const INVOICE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

const PDF_FILE = {
  url: "https://blob.vercel-storage.com/xero-invoices/inv/INV-1.pdf",
  pathname: "xero-invoices/inv/INV-1.pdf",
  filename: "INV-1.pdf",
}

function invoice(partial: Partial<InvoicePdfRecord> = {}): InvoicePdfRecord {
  return {
    xeroInvoiceId: INVOICE_ID,
    invoiceNumber: "INV-1",
    pdfFile: PDF_FILE,
    xeroContactId: "contact-1",
    contactName: "Acme Pty Ltd",
    ...partial,
  }
}

function streamBlob() {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("%PDF-1.4"))
      controller.close()
    },
  })
  return {
    statusCode: 200,
    stream,
    blob: { contentType: "application/pdf" },
  }
}

function jsonOf(res: Response): Promise<unknown> {
  return res.json()
}

function arRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/finance/invoices/${INVOICE_ID}/pdf`)
}

function apRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/finance/bills/${INVOICE_ID}/pdf`)
}

function adminDeps(overrides: Partial<ServeInvoicePdfDeps> = {}): ServeInvoicePdfDeps {
  const blob = streamBlob()
  return {
    getSession: async () => ({ user: { email: "admin@example.com" } }),
    getUserRoles: () => ["admin"],
    loadInvoice: async () => invoice(),
    resolveClient: async () => ({
      clientsId: 7,
      clientName: "Acme",
      paymentDays: 14,
      paymentTerms: "",
      resolved: true,
    }),
    assertClientAccess: async () => ({ ok: true, isClient: false }),
    getPrivateBlob: async () => blob,
    ...overrides,
  }
}

describe("owed pdfAvailable is reused (not a second flag)", () => {
  it("pdfAvailableFromJson is true iff pdf_file has a url key", () => {
    assert.equal(pdfAvailableFromJson(PDF_FILE), true)
    assert.equal(pdfAvailableFromJson(XANO_EMPTY_PDF_STUB), false)
    assert.equal(pdfAvailableFromJson(null), false)
  })
})

describe("invoicePdfBlobTarget", () => {
  it("prefers pathname over the private blob URL", () => {
    assert.equal(invoicePdfBlobTarget(PDF_FILE), PDF_FILE.pathname)
  })

  it("returns null when pdf_file has no url key (Xano stub / unsynced)", () => {
    assert.equal(invoicePdfBlobTarget(XANO_EMPTY_PDF_STUB), null)
    assert.equal(invoicePdfBlobTarget(null), null)
    assert.equal(invoicePdfBlobTarget({ filename: "x.pdf" }), null)
  })
})

describe("invoice pdf paths", () => {
  it("AR and AP are sibling routes keyed by xeroInvoiceId", () => {
    assert.equal(
      arInvoicePdfPath(INVOICE_ID),
      `/api/finance/invoices/${INVOICE_ID}/pdf`,
    )
    assert.equal(
      apInvoicePdfPath(INVOICE_ID),
      `/api/finance/bills/${INVOICE_ID}/pdf`,
    )
  })

  it("disposition filename is invoice_number.pdf", () => {
    assert.equal(invoicePdfDispositionFilename("INV-1"), "INV-1.pdf")
    assert.equal(invoicePdfDispositionFilename('INV"1'), 'INV\\"1.pdf')
  })
})

describe("GET AR invoice PDF", () => {
  it("admin gets the stream with Content-Disposition attachment", async () => {
    const blob = streamBlob()
    let blobTarget: string | null = null
    const res = await serveArInvoicePdf(arRequest(), INVOICE_ID, adminDeps({
      getPrivateBlob: async (target) => {
        blobTarget = target
        return blob
      },
    }))
    assert.equal(res.status, 200)
    assert.equal(res.headers.get("Content-Type"), "application/pdf")
    assert.equal(
      res.headers.get("Content-Disposition"),
      'attachment; filename="INV-1.pdf"',
    )
    assert.equal(blobTarget, PDF_FILE.pathname)
    assert.ok(res.body)
  })

  it("client-role caller for their own invoice gets the stream", async () => {
    const blob = streamBlob()
    let assertedClientId: number | null = null
    const res = await serveArInvoicePdf(arRequest(), INVOICE_ID, adminDeps({
      getUserRoles: () => ["client"],
      resolveClient: async () => ({
        clientsId: 7,
        clientName: "Acme",
        paymentDays: 14,
        paymentTerms: "",
        resolved: true,
      }),
      assertClientAccess: async (_req, clientId) => {
        assertedClientId = clientId
        return { ok: true, isClient: true }
      },
      getPrivateBlob: async () => blob,
    }))
    assert.equal(res.status, 200)
    assert.equal(assertedClientId, 7)
  })

  it("client-role caller for another client's invoice is refused", async () => {
    const res = await serveArInvoicePdf(arRequest(), INVOICE_ID, adminDeps({
      getUserRoles: () => ["client"],
      resolveClient: async () => ({
        clientsId: 7,
        clientName: "Acme",
        paymentDays: 14,
        paymentTerms: "",
        resolved: true,
      }),
      assertClientAccess: async () => ({
        ok: false,
        response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
      }),
      getPrivateBlob: async () => {
        throw new Error("must not read blob after refuse")
      },
    }))
    assert.equal(res.status, 403)
  })

  it("invoice with no resolved client refuses a client-role caller", async () => {
    let asserted = 0
    const res = await serveArInvoicePdf(arRequest(), INVOICE_ID, adminDeps({
      getUserRoles: () => ["client"],
      resolveClient: async () => ({
        clientsId: 0,
        clientName: "Unknown Co",
        paymentDays: 14,
        paymentTerms: "",
        resolved: false,
      }),
      assertClientAccess: async () => {
        asserted += 1
        return { ok: true, isClient: true }
      },
      getPrivateBlob: async () => {
        throw new Error("must not read blob for unresolved client")
      },
    }))
    assert.equal(res.status, 403)
    assert.deepEqual(await jsonOf(res), { error: "forbidden" })
    assert.equal(asserted, 0)
  })

  it("pdf_file without a url returns typed 404, not 500", async () => {
    const res = await serveArInvoicePdf(arRequest(), INVOICE_ID, adminDeps({
      loadInvoice: async () => invoice({ pdfFile: XANO_EMPTY_PDF_STUB }),
      getPrivateBlob: async () => {
        throw new Error("must not call blob when pdf_file has no url")
      },
    }))
    assert.equal(res.status, 404)
    assert.deepEqual(await jsonOf(res), PDF_NOT_AVAILABLE)
  })

  it("BlobNotFoundError is a typed 404, not 500", async () => {
    const res = await serveArInvoicePdf(arRequest(), INVOICE_ID, adminDeps({
      getPrivateBlob: async () => {
        throw new BlobNotFoundError()
      },
    }))
    assert.equal(res.status, 404)
    assert.deepEqual(await jsonOf(res), PDF_NOT_AVAILABLE)
  })

  it("missing invoice row is a typed 404", async () => {
    const res = await serveArInvoicePdf(arRequest(), INVOICE_ID, adminDeps({
      loadInvoice: async () => null,
    }))
    assert.equal(res.status, 404)
    assert.deepEqual(await jsonOf(res), PDF_NOT_AVAILABLE)
  })
})

describe("GET AP bill PDF (sibling, admin-only)", () => {
  it("admin gets the stream", async () => {
    const blob = streamBlob()
    const res = await serveApInvoicePdf(apRequest(), INVOICE_ID, adminDeps({
      getPrivateBlob: async () => blob,
    }))
    assert.equal(res.status, 200)
    assert.equal(
      res.headers.get("Content-Disposition"),
      'attachment; filename="INV-1.pdf"',
    )
  })

  it("client-role caller is refused even for a bill that exists", async () => {
    const res = await serveApInvoicePdf(apRequest(), INVOICE_ID, adminDeps({
      getUserRoles: () => ["client"],
      getPrivateBlob: async () => {
        throw new Error("AP must not stream to a client-role caller")
      },
    }))
    assert.equal(res.status, 403)
  })
})
