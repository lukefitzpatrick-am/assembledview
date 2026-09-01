import assert from "node:assert/strict"
import test from "node:test"

import {
  filterApprovedReceivablesForExport,
  invoiceKeysReadyToMarkSent,
  summariseLastExport,
} from "../approvedReceivablesExport.js"
import type { BillingRecord } from "@/lib/types/financeBilling.js"

function rec(partial: Partial<BillingRecord>): BillingRecord {
  return {
    id: 1,
    clients_id: 1,
    client_name: "Acme",
    billing_type: "media",
    mba_number: "X001",
    campaign_name: "Camp",
    billing_month: "2026-07",
    status: "booked",
    total: 100,
    line_items: [],
    billed: false,
    ...partial,
  } as BillingRecord
}

test("workbook filter keeps only rows with approved_at", () => {
  const rows = [
    rec({ id: 1, invoice_key: "media:X001:2026-07", approved_at: "2026-08-01T00:00:00.000Z", total: 40 }),
    rec({ id: 2, invoice_key: "media:X002:2026-07", approved_at: null, total: 99 }),
    rec({ id: 3, invoice_key: "media:X003:2026-07", total: 12 }),
  ]
  const approved = filterApprovedReceivablesForExport(rows)
  assert.equal(approved.length, 1)
  assert.equal(approved[0]?.invoice_key, "media:X001:2026-07")
})

test("last export summary uses max(exported_at) in the current scope", () => {
  const rows = [
    rec({
      id: 1,
      clients_id: 1,
      total: 40,
      exported_at: "2026-08-01T00:00:00.000Z",
      exported_by: 3,
      exported_by_name: "Old",
    }),
    rec({
      id: 2,
      clients_id: 2,
      total: 60,
      exported_at: "2026-09-01T12:00:00.000Z",
      exported_by: 7,
      exported_by_name: "Ada Admin",
    }),
    rec({
      id: 3,
      clients_id: 3,
      total: 80,
      exported_at: "2026-09-01T12:00:00.000Z",
      exported_by: 7,
      exported_by_name: "Ada Admin",
    }),
    rec({ id: 4, clients_id: 4, total: 999, exported_at: null }),
  ]
  const summary = summariseLastExport(rows)
  assert.ok(summary)
  assert.equal(summary.exportedAt, "2026-09-01T12:00:00.000Z")
  assert.equal(summary.exportedByName, "Ada Admin")
  assert.equal(summary.clientCount, 2)
  assert.equal(summary.total, 140)
})

test("last export summary is null when nothing in scope has been exported", () => {
  assert.equal(summariseLastExport([rec({ exported_at: null })]), null)
})

test("mark-as-sent keys include every approved invoice and skip unapproved ones", () => {
  const keys = invoiceKeysReadyToMarkSent([
    rec({ id: 1, invoice_key: "media:X001:2026-07", approved_at: "2026-08-01T00:00:00.000Z" }),
    rec({ id: 2, invoice_key: "media:X002:2026-07", approved_at: null }),
    rec({ id: 3, invoice_key: "media:X003:2026-07" }),
    rec({ id: 4, invoice_key: "  ", approved_at: "2026-08-01T00:00:00.000Z" }),
  ])
  assert.deepEqual(keys, ["media:X001:2026-07"])
})
