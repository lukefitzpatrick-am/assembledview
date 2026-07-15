import assert from "node:assert/strict"
import test from "node:test"
import {
  fingerprintMediaLineItems,
  publishMediaLineItemsIfChanged,
} from "@/lib/mediaplan/publishMediaLineItems"

test("fingerprint ignores _reactKey churn", () => {
  const a = [{ bursts: [{ budget: "10", _reactKey: "a" }] }]
  const b = [{ bursts: [{ budget: "10", _reactKey: "b" }] }]
  assert.equal(fingerprintMediaLineItems(a), fingerprintMediaLineItems(b))
})

test("publishMediaLineItemsIfChanged skips identical fingerprints", () => {
  const ref = { current: "" }
  let calls = 0
  const items = [{ line_item_id: "1", bursts: [{ budget: "0", _reactKey: "x" }] }]
  publishMediaLineItemsIfChanged(ref, items, () => {
    calls++
  })
  publishMediaLineItemsIfChanged(
    ref,
    [{ line_item_id: "1", bursts: [{ budget: "0", _reactKey: "y" }] }],
    () => {
      calls++
    }
  )
  assert.equal(calls, 1)
})

test("publishMediaLineItemsIfChanged publishes on real change", () => {
  const ref = { current: "" }
  let calls = 0
  publishMediaLineItemsIfChanged(ref, [{ budget: "0" }], () => {
    calls++
  })
  publishMediaLineItemsIfChanged(ref, [{ budget: "10" }], () => {
    calls++
  })
  assert.equal(calls, 2)
})
