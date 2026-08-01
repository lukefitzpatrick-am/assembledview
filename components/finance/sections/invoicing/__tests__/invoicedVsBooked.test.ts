import assert from "node:assert/strict"
import test from "node:test"
import {
  formatInvoicedVsBooked,
  formatInvoicedVsBookedForRecords,
} from "../invoicedVsBooked.js"
import type { BillingRecord } from "../../../../../lib/types/financeBilling.js"

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

test("invoiced vs booked shows em dash when no billed_amount", () => {
  const s = formatInvoicedVsBooked(rec({ total: 100, billed_amount: null }))
  assert.ok(s.startsWith("— /"))
  assert.ok(s.includes("100"))
})

test("invoiced vs booked shows both when billed_amount present", () => {
  const s = formatInvoicedVsBooked(rec({ total: 100, billed_amount: 80 }))
  assert.ok(s.includes("80"))
  assert.ok(s.includes("100"))
  assert.equal(s.includes("—"), false)
})

test("group helper sums invoiced and booked", () => {
  const s = formatInvoicedVsBookedForRecords([
    rec({ total: 50, billed_amount: 40 }),
    rec({ total: 50, billed_amount: 45 }),
  ])
  assert.ok(s.includes("85"))
  assert.ok(s.includes("100"))
})
