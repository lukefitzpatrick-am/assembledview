import assert from "node:assert/strict"
import test from "node:test"

import {
  filterByBillingTypes,
  filterByClients,
  filterByPublisherIds,
  filterBySearch,
  filterByStatuses,
} from "../filterBillingRecords.js"
import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling.js"

function line(publisher_name: string): BillingLineItem {
  return {
    id: 0,
    finance_billing_records_id: 0,
    item_code: "M",
    line_type: "media",
    media_type: "TV",
    description: "Spot",
    publisher_name,
    amount: 100,
    client_pays_media: false,
    sort_order: 0,
  }
}

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
    line_items: p.line_items ?? [line("Nine")],
    total: p.total ?? 100,
    has_pending_edits: false,
    source_billing_schedule_id: null,
    ...p,
  }
}

const twoClients = [
  record({ clients_id: 1, billing_type: "media" }),
  record({ clients_id: 2, billing_type: "media", client_name: "Beta" }),
]

test("filterByClients: empty csv returns input unchanged", () => {
  assert.equal(filterByClients(twoClients, null).length, 2)
  assert.equal(filterByClients(twoClients, "").length, 2)
})

test("filterByClients: single and multi id csv", () => {
  assert.equal(filterByClients(twoClients, "2").length, 1)
  assert.equal(filterByClients(twoClients, "2")[0]!.clients_id, 2)
  assert.equal(filterByClients(twoClients, "1,2").length, 2)
})

test("filterByClients: no match returns empty", () => {
  assert.equal(filterByClients(twoClients, "99").length, 0)
})

test("filterBySearch: empty query returns input unchanged", () => {
  assert.equal(filterBySearch(twoClients, null).length, 2)
  assert.equal(filterBySearch(twoClients, "   ").length, 2)
})

test("filterBySearch: case-insensitive match", () => {
  const rows = [record({ clients_id: 1, billing_type: "media", client_name: "Alpha Corp" })]
  assert.equal(filterBySearch(rows, "ALPHA").length, 1)
  assert.equal(filterBySearch(rows, "alpha corp").length, 1)
  assert.equal(filterBySearch(rows, "beta").length, 0)
})

test("filterBySearch: matches publisher on line items", () => {
  const rows = [
    record({ clients_id: 1, billing_type: "payable", line_items: [line("Seven")] }),
    record({ clients_id: 1, billing_type: "payable", line_items: [line("Nine")] }),
  ]
  assert.equal(filterBySearch(rows, "seven").length, 1)
})

test("filterByStatuses: empty csv returns input unchanged", () => {
  const rows = [record({ clients_id: 1, billing_type: "payable", status: "expected" })]
  assert.equal(filterByStatuses(rows, null).length, 1)
})

test("filterByStatuses: single and multi status csv", () => {
  const rows = [
    record({ clients_id: 1, billing_type: "payable", status: "expected" }),
    record({ clients_id: 1, billing_type: "payable", status: "booked" }),
  ]
  assert.equal(filterByStatuses(rows, "expected").length, 1)
  assert.equal(filterByStatuses(rows, "expected,booked").length, 2)
  assert.equal(filterByStatuses(rows, "paid").length, 0)
})

test("filterByBillingTypes: empty types returns input unchanged", () => {
  const rows = [record({ clients_id: 1, billing_type: "media" })]
  assert.equal(filterByBillingTypes(rows, []).length, 1)
})

test("filterByBillingTypes: filters to requested types", () => {
  const rows = [
    record({ clients_id: 1, billing_type: "media" }),
    record({ clients_id: 1, billing_type: "payable" }),
  ]
  assert.equal(filterByBillingTypes(rows, ["payable"]).length, 1)
  assert.equal(filterByBillingTypes(rows, ["payable"])[0]!.billing_type, "payable")
  assert.equal(filterByBillingTypes(rows, ["media", "sow"]).length, 1)
})

test("filterByPublisherIds: empty csv returns input unchanged", () => {
  const pubMap = new Map<number, string>([[10, "Nine"]])
  assert.equal(filterByPublisherIds(twoClients, null, pubMap).length, 2)
})

test("filterByPublisherIds: matches line publisher names", () => {
  const pubMap = new Map<number, string>([[10, "Nine"]])
  const rows = [
    record({ clients_id: 1, billing_type: "media", line_items: [line("Seven")] }),
    record({ clients_id: 1, billing_type: "media", line_items: [line("Nine")] }),
  ]
  assert.equal(filterByPublisherIds(rows, "10", pubMap).length, 1)
  // Unknown id → empty name set → helper returns input unchanged (billing route semantics)
  assert.equal(filterByPublisherIds(rows, "99", pubMap).length, 2)
})

test("filterByPublisherIds: retainer and sow kept when publisher filter active", () => {
  // NOTE: Stage 6 may change retainer behaviour here; preserving Stage 0 semantics for now
  const pubMap = new Map<number, string>([[10, "Nine"]])
  const rows = [
    record({ clients_id: 1, billing_type: "media", line_items: [line("Seven")] }),
    record({ clients_id: 1, billing_type: "retainer", line_items: [] }),
    record({ clients_id: 1, billing_type: "sow", line_items: [] }),
  ]
  const out = filterByPublisherIds(rows, "10", pubMap)
  assert.equal(out.length, 2)
  assert.ok(out.some((r) => r.billing_type === "retainer"))
  assert.ok(out.some((r) => r.billing_type === "sow"))
})
