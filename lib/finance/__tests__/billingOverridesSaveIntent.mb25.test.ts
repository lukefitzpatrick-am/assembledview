/**
 * MB-25 — save-payload override intent (GR-A / GR-B).
 *
 * (a) GET fails → save with authoritative:false → pre-existing overrides SURVIVE
 * (b) reset tombstone + refetch → save → that line GONE, siblings intact
 * (c) reset → Cancel (tombstone cleared) → save → override SURVIVES
 * (d) loaded, nothing anywhere → save → no rows, no error
 */

import assert from "node:assert/strict"
import test from "node:test"

import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import {
  BILLING_OVERRIDES_LOAD_BLOCK_CODE,
  addClearedBillingOverrideLineId,
  buildBillingOverridesSaveEnvelope,
  mergePendingOverSavedExcludingCleared,
  pruneClearedBillingOverrideLineIdsAfterApply,
  shouldBlockSaveForBillingOverridesLoad,
  shouldReplaceBillingOverridesFromPayload,
} from "../billingOverridesSaveIntent.js"

const savedA: BillingOverrideRow = {
  line_item_id: "lineA",
  component: "media",
  mode: "manual",
  reason: "prepayment",
  months: [{ month: "2026-08", amount: 1000 }],
  date_basis: "saved",
}

const savedB: BillingOverrideRow = {
  line_item_id: "lineB",
  component: "media",
  mode: "manual",
  reason: "manual",
  months: [{ month: "2026-08", amount: 500 }],
  date_basis: "saved",
}

const pendingA: BillingOverrideRow = {
  ...savedA,
  months: [{ month: "2026-08", amount: 1000 }],
  date_basis: "pending",
}

test("MB-25 vocab: load-state gate + envelope", () => {
  assert.equal(
    buildBillingOverridesSaveEnvelope({
      loadState: "loaded",
      clearedLineIds: ["billing-search::lineA"],
    }).authoritative,
    true
  )
  assert.equal(
    buildBillingOverridesSaveEnvelope({
      loadState: "failed",
      clearedLineIds: [],
    }).authoritative,
    false
  )
  assert.equal(
    buildBillingOverridesSaveEnvelope({
      loadState: "unknown",
      clearedLineIds: [],
    }).authoritative,
    false
  )
  assert.equal(shouldReplaceBillingOverridesFromPayload(null), false)
  assert.equal(
    shouldReplaceBillingOverridesFromPayload({
      authoritative: false,
      clearedLineIds: [],
    }),
    false
  )
  assert.equal(
    shouldReplaceBillingOverridesFromPayload({
      authoritative: true,
      clearedLineIds: ["lineA"],
    }),
    true
  )
  assert.equal(BILLING_OVERRIDES_LOAD_BLOCK_CODE, "BILLING_OVERRIDES_LOAD_UNAVAILABLE")
})

test("MB-25 (a) GET fails → authoritative false → REPLACE-SET must not run", () => {
  const envelope = buildBillingOverridesSaveEnvelope({
    loadState: "failed",
    clearedLineIds: [],
  })
  assert.equal(envelope.authoritative, false)
  assert.equal(shouldReplaceBillingOverridesFromPayload(envelope), false)
  // Client may still hold prior rows for display; save must not assert zero.
  assert.equal(
    shouldBlockSaveForBillingOverridesLoad({
      loadState: "failed",
      pendingCount: 0,
    }),
    false
  )
  assert.equal(
    shouldBlockSaveForBillingOverridesLoad({
      loadState: "failed",
      pendingCount: 1,
    }),
    true
  )
  assert.equal(
    shouldBlockSaveForBillingOverridesLoad({
      loadState: "unknown",
      pendingCount: 2,
    }),
    true
  )
})

test("MB-25 (b) reset → refetch → save → cleared line gone, sibling intact", () => {
  // After Reset: pending empty for A, tombstone has A; refetch restores saved A+B.
  const cleared = addClearedBillingOverrideLineId([], "billing-search::lineA")
  assert.deepEqual(cleared, ["lineA"])
  const merged = mergePendingOverSavedExcludingCleared(
    [],
    [savedA, savedB],
    cleared
  )
  assert.equal(merged.length, 1)
  assert.equal(String(merged[0]!.line_item_id), "lineB")
  const envelope = buildBillingOverridesSaveEnvelope({
    loadState: "loaded",
    clearedLineIds: cleared,
  })
  assert.equal(envelope.authoritative, true)
  assert.deepEqual(envelope.clearedLineIds, ["lineA"])
})

test("MB-25 (c) reset → Cancel → save → override survives", () => {
  let cleared = addClearedBillingOverrideLineId([], "lineA")
  // Cancel clears the tombstone.
  cleared = []
  const merged = mergePendingOverSavedExcludingCleared(
    [],
    [savedA, savedB],
    cleared
  )
  assert.equal(merged.length, 2)
  const envelope = buildBillingOverridesSaveEnvelope({
    loadState: "loaded",
    clearedLineIds: cleared,
  })
  assert.deepEqual(envelope.clearedLineIds, [])
  // Authoritative save with both lines still carrying overrides from merge.
  assert.ok(merged.some((r) => String(r.line_item_id) === "lineA"))
})

test("MB-25 (d) loaded, nothing anywhere → save → no rows, no error", () => {
  const merged = mergePendingOverSavedExcludingCleared([], [], [])
  assert.equal(merged.length, 0)
  const envelope = buildBillingOverridesSaveEnvelope({
    loadState: "loaded",
    clearedLineIds: [],
  })
  assert.equal(envelope.authoritative, true)
  assert.deepEqual(envelope.clearedLineIds, [])
  assert.equal(
    shouldBlockSaveForBillingOverridesLoad({
      loadState: "loaded",
      pendingCount: 0,
    }),
    false
  )
})

test("MB-25 Apply prunes re-asserted tombstone lines only", () => {
  const cleared = addClearedBillingOverrideLineId(
    addClearedBillingOverrideLineId([], "lineA"),
    "lineB"
  )
  const afterApply = pruneClearedBillingOverrideLineIdsAfterApply(cleared, [
    pendingA,
  ])
  assert.deepEqual(afterApply, ["lineB"])
})
