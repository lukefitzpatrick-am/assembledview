/**
 * MB-26 — header pill and Advanced/Edit amber dot share MB-24 provenance.
 *
 * Same-screen contradiction: amber said "unsaved overrides" while header said
 * "saved". Both must derive from resolveCampaignBillingTimingProvenance.
 */

import assert from "node:assert/strict"
import test from "node:test"

import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import {
  editBillingOverrideDotLabel,
  manualBillingHeaderLabel,
  resolveCampaignBillingTimingProvenance,
  withBillingTimingProvenance,
} from "../manualBillingVocabulary.js"

const saved: BillingOverrideRow = {
  line_item_id: "lineA",
  component: "media",
  mode: "manual",
  reason: "prepayment",
  months: [{ month: "2026-08", amount: 1000 }],
  date_basis: "saved",
}

const pending: BillingOverrideRow = {
  ...saved,
  date_basis: "pending",
  months: [{ month: "2026-08", amount: 1000 }],
}

test("MB-26: pending+saved → header and edit-dot both unsaved", () => {
  const provenance = resolveCampaignBillingTimingProvenance([pending], [saved], [])
  assert.equal(provenance, "unsaved")
  const header = manualBillingHeaderLabel(1, provenance)
  const dot = editBillingOverrideDotLabel(provenance!)
  assert.equal(header, "Manual billing — 1 line · unsaved")
  assert.equal(dot, "Unsaved billing overrides")
  // Same provenance string drives both surfaces.
  assert.ok(header.endsWith("· unsaved"))
  assert.equal(
    withBillingTimingProvenance("Manual billing — 1 line", provenance!),
    header
  )
})

test("MB-26: saved only → header and edit-dot both saved", () => {
  const provenance = resolveCampaignBillingTimingProvenance([], [saved], [])
  assert.equal(provenance, "saved")
  assert.equal(
    manualBillingHeaderLabel(1, provenance),
    "Manual billing — 1 line · saved"
  )
  assert.equal(editBillingOverrideDotLabel(provenance!), "Saved billing overrides")
})

test("MB-26: draft beats saved — both surfaces say not applied", () => {
  const draft: BillingOverrideRow = {
    ...saved,
    date_basis: "draft",
    months: [{ month: "2026-08", amount: 999 }],
  }
  const provenance = resolveCampaignBillingTimingProvenance([], [saved], [draft])
  assert.equal(provenance, "draft")
  assert.equal(
    manualBillingHeaderLabel(1, provenance),
    "Manual billing — 1 line · not applied"
  )
  assert.equal(
    editBillingOverrideDotLabel(provenance!),
    "Not applied billing overrides"
  )
})
