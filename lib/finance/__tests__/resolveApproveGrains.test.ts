import assert from "node:assert/strict"
import test from "node:test"

import type { BillingRecord } from "@/lib/types/financeBilling.js"
import {
  parseApproveRequestBody,
  resolveApproveGrains,
} from "../resolveApproveGrains.js"

function rec(partial: Partial<BillingRecord> = {}): BillingRecord {
  return {
    id: 1,
    clients_id: 17,
    client_name: "BIC",
    billing_type: "media",
    mba_number: "BICAU003",
    campaign_name: "Social",
    po_number: null,
    billing_month: "2026-06",
    invoice_date: null,
    payment_days: 30,
    payment_terms: "Net 30 days",
    status: "booked",
    total: 50,
    has_pending_edits: false,
    source_billing_schedule_id: null,
    invoice_key: "media:BICAU003:2026-06",
    line_items: [
      {
        id: 1,
        finance_billing_records_id: 1,
        item_code: "FEE",
        line_type: "fee",
        media_type: null,
        description: null,
        publisher_name: null,
        amount: 50,
        client_pays_media: false,
        sort_order: 0,
      },
    ],
    billed: false,
    ...partial,
  }
}

test("parseApproveRequestBody ignores a client grain with a wrong total", () => {
  const parsed = parseApproveRequestBody({
    invoice_keys: ["media:BICAU003:2026-06"],
    billing_month: "2026-06",
    grains: [
      {
        invoice_key: "media:BICAU003:2026-06",
        billing_type: "media",
        clients_id: 17,
        client_name: "BIC",
        mba_number: "BICAU003",
        campaign_name: "Social",
        billing_month: "2026-06",
        total: 999_999,
        line_items: [{ item_code: "FEE", amount: 999_999 }],
      },
    ],
  })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.deepEqual(parsed.invoice_keys, ["media:BICAU003:2026-06"])
  assert.equal(parsed.billing_month, "2026-06")
  assert.equal("grains" in parsed, false)
})

test("parseApproveRequestBody requires billing_month (no client grain fallback)", () => {
  const parsed = parseApproveRequestBody({
    invoice_keys: ["media:BICAU003:2026-06"],
    grains: [{ billing_month: "2026-06", total: 50 }],
  })
  assert.equal(parsed.ok, false)
})

test("approve snapshot uses the composed record total, not a client-supplied figure", () => {
  const composed = rec({ total: 50, line_items: [{ ...rec().line_items[0]!, amount: 50 }] })
  const { grains, notFound } = resolveApproveGrains(["media:BICAU003:2026-06"], [composed])
  assert.deepEqual(notFound, [])
  assert.equal(grains.length, 1)
  assert.equal(grains[0]!.total, 50)
  assert.equal(grains[0]!.line_items[0]!.amount, 50)
})

test("a key the server cannot derive is reported per-key; other keys still resolve", () => {
  const composed = rec()
  const { grains, notFound } = resolveApproveGrains(
    ["media:BICAU003:2026-06", "media:MISSING:2026-06"],
    [composed]
  )
  assert.equal(grains.length, 1)
  assert.equal(grains[0]!.invoice_key, "media:BICAU003:2026-06")
  assert.deepEqual(notFound, ["media:MISSING:2026-06"])
})
