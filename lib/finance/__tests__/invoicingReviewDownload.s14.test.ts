/**
 * S14 fix (review Q6 B): the Clients billing review downloads mark the rows
 * Send to accounts holds above plan. With the switch off (the route answers
 * 404) the files are byte-identical to the files without the switch.
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

const load = async () => ({
  ...(await import("@/lib/finance/invoicingReviewDownload")),
  ...(await import("@/lib/finance/exportFinanceHub")),
})

function record(over: Partial<BillingRecord>): BillingRecord {
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
    status: "approved",
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
    invoice_key: "media:KK001:2026-10",
    persisted_record_id: 11,
    approved_at: "2026-10-20T00:00:00Z",
    exported_at: null,
    state: "approved",
    ...over,
  } as BillingRecord
}

const records = [
  record({}),
  record({ id: 2, mba_number: "KK002", invoice_key: "media:KK002:2026-11", billing_month: "2026-11" }),
  // Sent already, and a retainer: neither month is asked about.
  record({ id: 3, invoice_key: "media:KK001:2026-09", billing_month: "2026-09", exported_at: "2026-09-30T00:00:00Z" }),
  record({ id: 4, billing_type: "retainer", invoice_key: "retainer:7:2026-08", billing_month: "2026-08", line_items: [] }),
]

function fakeFetch(answer: (month: string) => Response) {
  const urls: string[] = []
  const fetchImpl = (async (input: unknown) => {
    const url = String(input)
    urls.push(url)
    return answer(new URL(url, "http://x").searchParams.get("month") ?? "")
  }) as typeof fetch
  return { fetchImpl, urls }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

async function csvOf(rows: BillingRecord[]): Promise<string> {
  const { downloadInvoicingReviewCsv } = await load()
  const saved: Blob[] = []
  downloadInvoicingReviewCsv(rows, { from: "2026-08", to: "2026-11" }, { save: (b) => saved.push(b) })
  return saved[0]!.text()
}

test("switch off (404): records come back as they were and the CSV is byte-identical", { skip }, async () => {
  const { markHeldAbovePlan } = await load()
  const { fetchImpl, urls } = fakeFetch(() => json({ error: "not_found" }, 404))
  const out = await markHeldAbovePlan(records, fetchImpl)
  assert.equal(out, records)
  assert.deepEqual(urls, ["/api/finance/billing/above-plan-reason?month=2026-10"])
  assert.equal(await csvOf(out), await csvOf(records))
})

test("switch on: one GET per unsent media month; held rows say so in the CSV and the workbook", { skip }, async () => {
  const { markHeldAbovePlan, buildReceivablesWorkbookBytes } = await load()
  const { fetchImpl, urls } = fakeFetch((month) =>
    json({ month, held: month === "2026-11" ? [{ invoice_key: "media:KK002:2026-11", above_plan_cents: 500 }] : [] }),
  )
  const out = await markHeldAbovePlan(records, fetchImpl)
  assert.deepEqual(urls, [
    "/api/finance/billing/above-plan-reason?month=2026-10",
    "/api/finance/billing/above-plan-reason?month=2026-11",
  ])
  assert.deepEqual(out.map((r) => r.held_above_plan === true), [false, true, false, false])
  assert.equal(records[1]!.held_above_plan, undefined, "the shown records are not mutated")

  const csv = (await csvOf(out)).split("\n")
  assert.ok(csv.some((l) => l.startsWith('line,"Krusty Krab","KK002"') && l.includes(",Held above plan,2026-11,")))
  assert.ok(csv.some((l) => l.startsWith('line,"Krusty Krab","KK001"') && l.includes(",approved,2026-10,")))

  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await buildReceivablesWorkbookBytes(out, new Map(), { review: true }))
  const cells: string[] = []
  wb.eachSheet((ws) => ws.eachRow((row) => cells.push((row.values as unknown[]).map((v) => String(v ?? "")).join("|"))))
  assert.equal(cells.filter((c) => c.includes("|Status|Held above plan")).length, 1)
  assert.equal(cells.filter((c) => c.includes("|Status|Approved")).length, 3)
})

test("any other failure stops the download rather than leave held rows unmarked", { skip }, async () => {
  const { markHeldAbovePlan } = await load()
  const { fetchImpl } = fakeFetch(() => json({ error: "Internal server error" }, 500))
  await assert.rejects(markHeldAbovePlan(records, fetchImpl), /held above plan for 2026-10 \(500\)/)
})

test("nothing unsent: no request", { skip }, async () => {
  const { markHeldAbovePlan } = await load()
  const { fetchImpl, urls } = fakeFetch(() => json({ held: [] }))
  const sent = [records[2]!, records[3]!]
  assert.equal(await markHeldAbovePlan(sent, fetchImpl), sent)
  assert.deepEqual(urls, [])
})
