import assert from "node:assert/strict"
import test from "node:test"

import { featureDefinition } from "@/lib/features/registry"
import { computedCentsByInvoiceKey, storedBillingStands } from "@/lib/finance/billingOnRead"

const none = { approved_at: null, exported_at: null, matched_xero_invoice_id: null, billed: false }

test("a stored amount stands once approved, sent, matched or billed, and not before", () => {
  assert.equal(storedBillingStands(none), false)
  assert.equal(storedBillingStands({ ...none, approved_at: "", matched_xero_invoice_id: "", billed: null }), false)
  assert.equal(storedBillingStands({ ...none, approved_at: "2026-06-01T00:00:00Z" }), true)
  assert.equal(storedBillingStands({ ...none, exported_at: "2026-06-01T00:00:00Z" }), true)
  assert.equal(storedBillingStands({ ...none, matched_xero_invoice_id: "abc" }), true)
  assert.equal(storedBillingStands({ ...none, matched_xero_invoice_id: "  " }), false, "a blank match id is no match")
  assert.equal(storedBillingStands({ ...none, billed: true }), true)
})

test("computed cents per invoice key: integer cents, any case, summed, non-finite and keyless left out", () => {
  const out = computedCentsByInvoiceKey([
    { invoice_key: "media:AC-001:2026-05", total: 1000.005 },
    { invoice_key: "media:ac-001:2026-05", total: 0.1 },
    { invoice_key: "media:AC-001:2026-06", total: Number.NaN },
    { invoice_key: null, total: 5 },
    { invoice_key: "retainer:7:2026-05", total: 0.29 },
  ])
  assert.deepEqual([...out], [
    ["media:ac-001:2026-05", 100011],
    ["retainer:7:2026-05", 29],
  ])
})

test("billing_compute_on_read is off by default and needs nothing first", () => {
  const def = featureDefinition("billing_compute_on_read")
  assert.equal(def?.defaultOn, false)
  assert.equal(def?.requires, undefined)
  assert.equal(def?.requiresMarker, undefined)
})
