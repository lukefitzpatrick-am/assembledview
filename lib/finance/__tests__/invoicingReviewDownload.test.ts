/**
 * Clients billing "Download Excel" / "Download CSV" (review before sending).
 * Read-only: GET /api/clients only, no stamp, records untouched. Same workbook
 * builder as the Send to accounts pack.
 * Requires Node 22+ with `--experimental-test-module-mocks` (file-saver is CJS).
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"
import type { BillingRecord } from "@/lib/types/financeBilling"

const skip = mockModuleSkip()

if (typeof mock.module === "function") {
  await mock.module("file-saver", {
    namedExports: { saveAs: () => undefined },
    defaultExport: { saveAs: () => undefined },
  })
}

const load = async () => {
  const review = await import("@/lib/finance/invoicingReviewDownload")
  const hub = await import("@/lib/finance/exportFinanceHub")
  return { ...review, ...hub }
}

function reviewRecord(over: Partial<BillingRecord>): BillingRecord {
  return {
    id: 1,
    billing_type: "media",
    clients_id: 7,
    client_name: "Krusty Krab",
    mba_number: "KK001",
    campaign_name: "Spring",
    po_number: null,
    billing_month: "2026-10",
    invoice_date: null,
    payment_days: 30,
    payment_terms: "Days from invoice",
    status: "booked",
    line_items: [
      {
        id: 1,
        finance_billing_records_id: 1,
        item_code: "G.DIG",
        line_type: "media",
        media_type: "Digital",
        description: "Display",
        publisher_name: "Pub",
        amount: 100,
        client_pays_media: false,
        sort_order: 0,
      },
    ],
    total: 100,
    has_pending_edits: false,
    source_billing_schedule_id: null,
    invoice_key: "k1",
    persisted_record_id: 11,
    approved_at: null,
    exported_at: null,
    state: "ready",
    ...over,
  } as BillingRecord
}

async function sheetText(bytes: ArrayBuffer | Buffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as ArrayBuffer)
  const out: string[] = []
  wb.eachSheet((ws) => {
    out.push(`#${ws.name}`)
    ws.eachRow((row) => {
      out.push((row.values as unknown[]).map((v) => (v == null ? "" : String(v))).join("|"))
    })
  })
  return out.join("\n")
}

test("Download Excel: only GET /api/clients, records untouched, every row with status", { skip }, async () => {
  const { downloadInvoicingReviewWorkbook, buildReceivablesWorkbookBuffer } = await load()
  const records = [
    reviewRecord({}),
    reviewRecord({
      id: 2,
      clients_id: 8,
      client_name: "Chum Bucket",
      mba_number: "CB001",
      invoice_key: "k2",
      approved_at: "2026-10-20T00:00:00Z",
      status: "approved",
      state: "approved",
    }),
    reviewRecord({
      id: 3,
      billing_type: "retainer",
      clients_id: 8,
      client_name: "Chum Bucket",
      mba_number: null,
      invoice_key: "k3",
      line_items: [],
      total: 500,
      state: "sent_to_finance",
      exported_at: "2026-10-01T00:00:00Z",
    }),
  ]
  const before = JSON.stringify(records)
  const calls: Array<{ url: string; method: string }> = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: unknown, init?: { method?: string }) => {
    calls.push({ url: String(input), method: (init?.method ?? "GET").toUpperCase() })
    return new Response(
      JSON.stringify([
        { id: 7, clientname_input: "Krusty Krab", legalbusinessname: "", abn: "1" },
        { id: 8, clientname_input: "Chum Bucket", legalbusinessname: "Chum Pty Ltd", abn: "2" },
        { id: 9, clientname_input: "Other", legalbusinessname: "", abn: "" },
      ]),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  }) as typeof fetch
  const saved: Array<{ blob: Blob; name: string }> = []
  try {
    const result = await downloadInvoicingReviewWorkbook(
      records,
      { from: "2026-07", to: "2026-10" },
      { save: (blob, name) => saved.push({ blob, name }) }
    )
    assert.deepEqual(calls, [{ url: "/api/clients", method: "GET" }])
    assert.equal(JSON.stringify(records), before, "records must not be mutated or stamped")
    assert.equal(saved.length, 1)
    assert.equal(saved[0]!.name, "Clients_billing_2026-07_2026-10.xlsx")
    assert.deepEqual(
      result.missingLegalBusinessNames.map((c) => c.clientId),
      [7],
      "FIN-6 warning lists only clients shown"
    )
    const text = await sheetText(await saved[0]!.blob.arrayBuffer())
    assert.ok(text.includes("|Status|Ready"), "unapproved row present with status")
    assert.ok(text.includes("|Status|Approved"))
    assert.ok(text.includes("|Status|Sent to finance"))
    assert.ok(text.includes("Krusty Krab - Spring (KK001)"))
    assert.ok(text.includes("G.DIG"))

    // Accounts pack (same builder): approved only, no Status row.
    const pack = await sheetText(
      await buildReceivablesWorkbookBuffer(records, new Map([[8, { legalBusinessName: "Chum Pty Ltd", abn: "2" }]]))
    )
    assert.equal(pack.includes("Status"), false)
    assert.equal(pack.includes("Krusty Krab"), false)
    assert.ok(pack.includes("Chum Bucket - Spring (CB001)"))
  } finally {
    globalThis.fetch = realFetch
  }
})

test("Download CSV: pack columns, every row shown, no network", { skip }, async () => {
  const { downloadInvoicingReviewCsv, invoicingReviewFileStem } = await load()
  const realFetch = globalThis.fetch
  let fetched = false
  globalThis.fetch = (async () => {
    fetched = true
    throw new Error("no fetch")
  }) as typeof fetch
  const saved: Array<{ blob: Blob; name: string }> = []
  try {
    downloadInvoicingReviewCsv(
      [reviewRecord({}), reviewRecord({ id: 2, invoice_key: "k2", status: "approved" })],
      { from: "2026-10", to: "2026-10" },
      { save: (blob, name) => saved.push({ blob, name }) }
    )
  } finally {
    globalThis.fetch = realFetch
  }
  assert.equal(fetched, false)
  assert.equal(saved[0]!.name, "Clients_billing_2026-10_2026-10.csv")
  assert.equal(invoicingReviewFileStem({ from: "a", to: "b" }), "Clients_billing_a_b")
  return saved[0]!.blob.text().then((csv) => {
    const lines = csv.split("\n")
    assert.equal(lines[0], "client_name,mba_number,campaign_name,billing_type,status,billing_month,total")
    assert.equal(lines.length, 3)
    assert.equal(lines[1], '"Krusty Krab","KK001","Spring",media,booked,2026-10,100.00')
  })
})
