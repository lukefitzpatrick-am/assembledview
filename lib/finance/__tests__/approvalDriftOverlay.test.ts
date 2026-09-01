import assert from "node:assert/strict"
import test from "node:test"

import { hashBilledLineSet } from "../billedDrift.js"
import { applyStatusOverlay, type PersistedFinanceStatusRow } from "../overlayFinanceStatus.js"
import type { BillingRecord } from "@/lib/types/financeBilling.js"

function rec(partial: Partial<BillingRecord> = {}): BillingRecord {
  return {
    id: 1,
    clients_id: 1,
    client_name: "Acme",
    billing_type: "media",
    mba_number: "AC-001",
    campaign_name: "Winter",
    billing_month: "2026-05",
    status: "booked",
    total: 150,
    line_items: [
      {
        id: 1,
        finance_billing_records_id: 1,
        item_code: "TV-1",
        line_type: "media",
        media_type: "tv",
        description: null,
        publisher_name: null,
        amount: 150,
        client_pays_media: false,
        sort_order: 0,
        schedule_line_item_id: "a",
      },
    ],
    billed: false,
    ...partial,
  } as BillingRecord
}

test("approval snapshot mismatch surfaces approved_drift without blocking", () => {
  const approvedHash = hashBilledLineSet([
    { item_code: "TV-1", amount: 100, schedule_line_item_id: "a" },
  ])
  const persisted: PersistedFinanceStatusRow = {
    id: 55,
    clients_id: 1,
    mba_number: "AC-001",
    campaign_name: "Winter",
    billing_type: "media",
    billing_month: "2026-05",
    billed: false,
    billed_at: null,
    billed_by: null,
    notes: null,
    exported_at: null,
    exported_by: null,
    invoice_key: "media:AC-001:2026-05",
    approved_at: "2026-08-20T00:00:00.000Z",
    approved_amount: 100,
    approved_lines_hash: approvedHash,
  }
  const overlayed = applyStatusOverlay(
    rec({ total: 150 }),
    new Map([["media:AC-001:2026-05", persisted]])
  )
  assert.equal(overlayed.state, "approved")
  assert.equal(overlayed.approved_drift, true)
  assert.equal(overlayed.approved_drift_delta, 50)
})

test("matching approval snapshot is not drifted", () => {
  const lines = [{ item_code: "TV-1", amount: 150, schedule_line_item_id: "a" }]
  const persisted: PersistedFinanceStatusRow = {
    id: 55,
    clients_id: 1,
    mba_number: "AC-001",
    campaign_name: "Winter",
    billing_type: "media",
    billing_month: "2026-05",
    billed: false,
    billed_at: null,
    billed_by: null,
    notes: null,
    exported_at: null,
    exported_by: null,
    invoice_key: "media:AC-001:2026-05",
    approved_at: "2026-08-20T00:00:00.000Z",
    approved_amount: 150,
    approved_lines_hash: hashBilledLineSet(lines),
  }
  const overlayed = applyStatusOverlay(rec(), new Map([["media:AC-001:2026-05", persisted]]))
  assert.equal(overlayed.approved_drift, false)
  assert.equal(overlayed.approved_drift_delta, 0)
})
