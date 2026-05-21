import assert from "node:assert/strict"
import test from "node:test"

import {
  applyHubBillingRecordFilters,
  filterBillingRecordsByClients,
  filterBillingRecordsByPublisherIds,
  filterBillingRecordsBySearch,
  filterBillingRecordsByStatuses,
  filterPlanVersionsByIncludeDrafts,
} from "../../lib/finance/filterBillingRecords.js"
import type { BillingRecord } from "../../lib/types/financeBilling.js"

function record(p: Partial<BillingRecord> & Pick<BillingRecord, "clients_id" | "billing_type">): BillingRecord {
  return {
    id: 0,
    client_name: p.client_name ?? "Acme",
    mba_number: p.mba_number ?? "MBA-1",
    campaign_name: p.campaign_name ?? "Campaign",
    po_number: null,
    billing_month: p.billing_month ?? "2026-05",
    invoice_date: null,
    payment_days: 30,
    payment_terms: "Net 30",
    status: p.status ?? "booked",
    line_items: p.line_items ?? [
      {
        id: 0,
        finance_billing_records_id: 0,
        item_code: "M",
        line_type: "media",
        media_type: "TV",
        description: "Spot",
        publisher_name: "Nine",
        amount: 100,
        client_pays_media: false,
        sort_order: 0,
      },
    ],
    total: p.total ?? 100,
    has_pending_edits: false,
    source_billing_schedule_id: null,
    ...p,
  }
}

test("filterBillingRecordsByClients keeps only matching client ids", () => {
  const rows = [record({ clients_id: 1, billing_type: "media" }), record({ clients_id: 2, billing_type: "media" })]
  const out = filterBillingRecordsByClients(rows, "2")
  assert.equal(out.length, 1)
  assert.equal(out[0]!.clients_id, 2)
})

test("filterBillingRecordsBySearch matches line item publisher text", () => {
  const rows = [
    record({ clients_id: 1, billing_type: "payable", line_items: [{ ...record({ clients_id: 1, billing_type: "payable" }).line_items[0]!, publisher_name: "Nine" }] }),
    record({ clients_id: 1, billing_type: "payable", line_items: [{ ...record({ clients_id: 1, billing_type: "payable" }).line_items[0]!, publisher_name: "Seven" }] }),
  ]
  const out = filterBillingRecordsBySearch(rows, "seven")
  assert.equal(out.length, 1)
  assert.equal(out[0]!.line_items[0]!.publisher_name, "Seven")
})

test("filterBillingRecordsByStatuses filters by hub status", () => {
  const rows = [
    record({ clients_id: 1, billing_type: "payable", status: "expected" }),
    record({ clients_id: 1, billing_type: "payable", status: "booked" }),
  ]
  const out = filterBillingRecordsByStatuses(rows, "expected")
  assert.equal(out.length, 1)
  assert.equal(out[0]!.status, "expected")
})

test("filterBillingRecordsByPublisherIds passes retainer through and matches line publishers", () => {
  const pubMap = new Map<number, string>([[10, "Nine"]])
  const li = record({ clients_id: 1, billing_type: "media" }).line_items[0]!
  const rows = [
    record({
      clients_id: 1,
      billing_type: "media",
      line_items: [{ ...li, publisher_name: "Seven" }],
    }),
    record({ clients_id: 1, billing_type: "retainer", line_items: [] }),
  ]
  const out = filterBillingRecordsByPublisherIds(rows, "10", pubMap)
  assert.equal(out.length, 1)
  assert.equal(out[0]!.billing_type, "retainer")
})

test("filterPlanVersionsByIncludeDrafts drops non-booked campaigns when drafts excluded", () => {
  const versions = [
    { campaign_status: "draft", mba_number: "A" },
    { campaign_status: "booked", mba_number: "B" },
    { campaign_status: "approved", mba_number: "C" },
    { campaign_status: "completed", mba_number: "D" },
  ]
  const out = filterPlanVersionsByIncludeDrafts(versions, false)
  assert.deepEqual(
    out.map((v) => v.mba_number),
    ["B", "C", "D"]
  )
})

test("applyHubBillingRecordFilters chains client, search, publisher, and billing type", () => {
  const pubMap = new Map<number, string>([[5, "Nine"]])
  const rows = [
    record({ clients_id: 1, billing_type: "media", client_name: "Alpha" }),
    record({ clients_id: 2, billing_type: "payable", client_name: "Beta" }),
  ]
  const out = applyHubBillingRecordFilters(
    rows,
    {
      clientsIdCsv: "2",
      search: "beta",
      statusCsv: null,
      publishersIdCsv: "5",
      billingTypes: ["payable"],
    },
    pubMap
  )
  assert.equal(out.length, 1)
  assert.equal(out[0]!.billing_type, "payable")
})
