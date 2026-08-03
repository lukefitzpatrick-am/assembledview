/**
 * MB-21 — saved vs unsaved axis on the MB-9 manual-billing vocabulary.
 *
 * Conceptual state → display word (same string on every surface):
 *   manual timing + saved     → Manual · saved
 *   manual timing + unsaved   → Manual · unsaved
 *   prepaid media + saved     → Media prepaid · saved
 *   prepaid media + unsaved   → Media prepaid · unsaved
 *   prepaid media+fee + saved → Prepaid · saved
 *   prepaid media+fee + unsaved → Prepaid · unsaved
 *   fee adjusted + saved/unsaved → Fee adjusted · saved|unsaved
 *   Matches MBA (no pending)  → Matches MBA
 *   Matches MBA + pending     → Matches MBA · unsaved
 *   Edit Billing dot saved    → aria/title "Saved billing overrides"
 *   Edit Billing dot unsaved  → aria/title "Unsaved billing overrides"
 *   pending contradicts table → same unsaved label + differsFromSaved tooltip/flag
 */

import assert from "node:assert/strict"
import test from "node:test"

import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import {
  MANUAL_BILLING_VOCAB,
  billingEqualsMbaLabel,
  editBillingOverrideDotLabel,
  formatManualBillingStatusLabel,
  manualBillingHeaderLabel,
  pendingContradictsSavedForLine,
  resolveLineBillingTimingProvenance,
  withBillingTimingProvenance,
} from "../manualBillingVocabulary.js"

const savedPrepaid: BillingOverrideRow = {
  line_item_id: "supabase001PB1",
  component: "media",
  mode: "manual",
  reason: "prepayment",
  date_basis: "saved",
  months: [
    { month: "2026-08", amount: 10_163.93 },
    { month: "2026-09", amount: 9_836.07 },
  ],
}

const pendingPrepaid: BillingOverrideRow = {
  line_item_id: "supabase001PB1",
  component: "media",
  mode: "manual",
  reason: "prepayment",
  date_basis: "pending",
  months: [
    { month: "2026-08", amount: 20_000 },
    { month: "2026-09", amount: 0 },
  ],
}

const pendingAgreeing: BillingOverrideRow = {
  ...pendingPrepaid,
  months: [
    { month: "2026-08", amount: 10_163.93 },
    { month: "2026-09", amount: 9_836.07 },
  ],
}

test("MB-21 vocab: saved/unsaved axis extends MB-9 words", () => {
  assert.equal(MANUAL_BILLING_VOCAB.saved, "saved")
  assert.equal(MANUAL_BILLING_VOCAB.unsaved, "unsaved")
  assert.equal(
    withBillingTimingProvenance(MANUAL_BILLING_VOCAB.prepaidMedia, "saved"),
    "Media prepaid · saved"
  )
  assert.equal(
    withBillingTimingProvenance(MANUAL_BILLING_VOCAB.prepaidMedia, "unsaved"),
    "Media prepaid · unsaved"
  )
  assert.equal(
    withBillingTimingProvenance(MANUAL_BILLING_VOCAB.manualTiming, "unsaved"),
    "Manual · unsaved"
  )
  assert.equal(
    withBillingTimingProvenance(MANUAL_BILLING_VOCAB.prepaidMediaAndFee, "saved"),
    "Prepaid · saved"
  )
})

test("MB-21 (a) DB rows only → saved provenance label", () => {
  const provenance = resolveLineBillingTimingProvenance(
    "billing-search::supabase001PB1",
    [],
    [savedPrepaid]
  )
  assert.equal(provenance, "saved")
  assert.equal(
    formatManualBillingStatusLabel("prepaidMedia", provenance),
    "Media prepaid · saved"
  )
  assert.equal(pendingContradictsSavedForLine("supabase001PB1", [], [savedPrepaid]), false)
  assert.equal(editBillingOverrideDotLabel("saved"), "Saved billing overrides")
  assert.equal(billingEqualsMbaLabel({ matches: true, hasPending: false }), "Matches MBA")
})

test("MB-21 (b) pending rows only → unsaved provenance label", () => {
  const provenance = resolveLineBillingTimingProvenance(
    "supabase001PB1",
    [pendingPrepaid],
    []
  )
  assert.equal(provenance, "unsaved")
  assert.equal(
    formatManualBillingStatusLabel("prepaidMedia", provenance),
    "Media prepaid · unsaved"
  )
  assert.equal(editBillingOverrideDotLabel("unsaved"), "Unsaved billing overrides")
  assert.equal(
    billingEqualsMbaLabel({ matches: true, hasPending: true }),
    "Matches MBA · unsaved"
  )
  assert.equal(
    manualBillingHeaderLabel(1, "unsaved"),
    "Manual billing — 1 line · unsaved"
  )
})

test("MB-21 (c) both pending and saved (agreeing) → unsaved (pending drives display)", () => {
  const provenance = resolveLineBillingTimingProvenance(
    "supabase001PB1",
    [pendingAgreeing],
    [savedPrepaid]
  )
  assert.equal(provenance, "unsaved")
  assert.equal(
    formatManualBillingStatusLabel("prepaidMedia", provenance),
    "Media prepaid · unsaved"
  )
  assert.equal(
    pendingContradictsSavedForLine("supabase001PB1", [pendingAgreeing], [savedPrepaid]),
    false
  )
})

test("MB-21 (d) pending contradicts saved — 3 Aug shape is unambiguous", () => {
  const provenance = resolveLineBillingTimingProvenance(
    "supabase001PB1",
    [pendingPrepaid],
    [savedPrepaid]
  )
  assert.equal(provenance, "unsaved")
  const label = formatManualBillingStatusLabel("prepaidMedia", provenance, {
    differsFromSaved: true,
  })
  // Primary word stays Media prepaid · unsaved; contradiction is explicit in the label.
  assert.equal(label, "Media prepaid · unsaved · differs from saved")
  assert.equal(
    pendingContradictsSavedForLine("supabase001PB1", [pendingPrepaid], [savedPrepaid]),
    true
  )
  assert.equal(
    billingEqualsMbaLabel({ matches: true, hasPending: true }),
    "Matches MBA · unsaved"
  )
})
