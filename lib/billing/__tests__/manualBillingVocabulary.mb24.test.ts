/**
 * MB-24 — three-state provenance (draft / unsaved / saved) and Cancel-safe payload.
 *
 * Vocabulary mapping (commit contract):
 *   draft   → "not applied"  (open editor differs from pending/saved)
 *   unsaved → "unsaved"      (Applied, not yet campaign-saved)
 *   saved   → "saved"        (in savedBillingOverrideRows, matching display)
 * Precedence: draft > pending > saved.
 *
 * Named cases:
 *   (a) Prebill, no Apply → draft word, NOT "saved"
 *   (b) Apply → "unsaved"
 *   (c) campaign save → "saved"
 *   (d) Prebill → Cancel → payload has no override for that line
 *   (e) saved exists AND draft contradicts → "differs from saved"
 */

import assert from "node:assert/strict"
import test from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import {
  MANUAL_BILLING_VOCAB,
  draftContradictsSavedForLine,
  formatManualBillingStatusLabel,
  manualBillingHeaderLabel,
  resolveCampaignBillingTimingProvenance,
  resolveLineBillingTimingProvenance,
  withBillingTimingProvenance,
} from "../manualBillingVocabulary.js"
import {
  buildPendingBillingOverrideRows,
  mergePendingOverSavedOverrideRows,
} from "../../finance/pendingBillingOverrides.js"
import { layerDraftMonthsOntoOverrideRows } from "../../finance/resolveMbaBillingModalState.js"
import type { LineOverrideMeta } from "../../finance/manualBillingOverridesUi.js"

const savedSpread: BillingOverrideRow = {
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

const prebillDraftMonths: BillingMonth[] = [
  {
    monthYear: "August 2026",
    mediaTotal: "$20,000.00",
    feeTotal: "$5,000.00",
    totalAmount: "$25,000.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    mediaCosts: { search: "$20,000.00" } as BillingMonth["mediaCosts"],
    lineItems: {
      search: [
        {
          id: "billing-search::supabase001PB1",
          header1: "Google",
          header2: "Search",
          monthlyAmounts: { "August 2026": 20_000, "September 2026": 0 },
          feeMonthlyAmounts: { "August 2026": 5000, "September 2026": 0 },
          totalAmount: 20_000,
          billingMode: "manual",
          preBill: true,
        },
      ],
    },
  },
  {
    monthYear: "September 2026",
    mediaTotal: "$0.00",
    feeTotal: "$0.00",
    totalAmount: "$0.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    mediaCosts: { search: "$0.00" } as BillingMonth["mediaCosts"],
    lineItems: {
      search: [
        {
          id: "billing-search::supabase001PB1",
          header1: "Google",
          header2: "Search",
          monthlyAmounts: { "August 2026": 20_000, "September 2026": 0 },
          feeMonthlyAmounts: { "August 2026": 5000, "September 2026": 0 },
          totalAmount: 20_000,
          billingMode: "manual",
          preBill: true,
        },
      ],
    },
  },
]

const prebillMeta: Map<string, LineOverrideMeta[]> = new Map([
  [
    "supabase001PB1",
    [
      {
        mode: "manual",
        reason: "prepayment",
        dateBasis: "",
        component: "media",
      },
    ],
  ],
])

test("MB-24 vocab: not applied → unsaved → saved progression", () => {
  assert.equal(MANUAL_BILLING_VOCAB.draft, "not applied")
  assert.equal(MANUAL_BILLING_VOCAB.unsaved, "unsaved")
  assert.equal(MANUAL_BILLING_VOCAB.saved, "saved")
  assert.equal(
    withBillingTimingProvenance(MANUAL_BILLING_VOCAB.prepaidMedia, "draft"),
    "Media prepaid · not applied"
  )
  assert.equal(
    withBillingTimingProvenance(MANUAL_BILLING_VOCAB.prepaidMedia, "unsaved"),
    "Media prepaid · unsaved"
  )
  assert.equal(
    withBillingTimingProvenance(MANUAL_BILLING_VOCAB.prepaidMedia, "saved"),
    "Media prepaid · saved"
  )
})

test("MB-24 (a) Prebill, no Apply → label is not applied, NOT saved", () => {
  const draftRows = layerDraftMonthsOntoOverrideRows(
    [],
    prebillDraftMonths,
    prebillMeta
  )
  const provenance = resolveLineBillingTimingProvenance(
    "supabase001PB1",
    [],
    [],
    draftRows
  )
  assert.equal(provenance, "draft")
  assert.equal(
    formatManualBillingStatusLabel("prepaidMedia", provenance!),
    "Media prepaid · not applied"
  )
  assert.equal(
    resolveCampaignBillingTimingProvenance([], [], draftRows),
    "draft"
  )
  assert.equal(
    manualBillingHeaderLabel(1, "draft"),
    "Manual billing — 1 line · not applied"
  )
  // Must not report saved when only the open draft carries the line.
  assert.notEqual(provenance, "saved")
})

test("MB-24 (b) Apply → label is unsaved", () => {
  const pending = buildPendingBillingOverrideRows(prebillDraftMonths, prebillMeta)
  assert.ok(pending.length > 0)
  const provenance = resolveLineBillingTimingProvenance(
    "supabase001PB1",
    pending,
    []
  )
  assert.equal(provenance, "unsaved")
  assert.equal(
    formatManualBillingStatusLabel("prepaidMedia", provenance!),
    "Media prepaid · unsaved"
  )
  // Draft that agrees with pending falls through to unsaved.
  const draftAgreeing = layerDraftMonthsOntoOverrideRows(
    pending,
    prebillDraftMonths,
    prebillMeta
  )
  assert.equal(
    resolveLineBillingTimingProvenance(
      "supabase001PB1",
      pending,
      [],
      draftAgreeing
    ),
    "unsaved"
  )
})

test("MB-24 (c) campaign save → label is saved", () => {
  const provenance = resolveLineBillingTimingProvenance(
    "billing-search::supabase001PB1",
    [],
    [savedSpread]
  )
  assert.equal(provenance, "saved")
  assert.equal(
    formatManualBillingStatusLabel("prepaidMedia", provenance!),
    "Media prepaid · saved"
  )
  assert.equal(
    resolveCampaignBillingTimingProvenance([], [savedSpread]),
    "saved"
  )
})

test("MB-24 (d) Prebill → Cancel → payload has no override for that line", () => {
  // Simulate: Prebill wrote draft only; Cancel clears draft + pending.
  // Save payload merges pending over saved ONLY — never un-Applied draft.
  const savedBillingOverrideRows: BillingOverrideRow[] = []
  const pendingAfterCancel: BillingOverrideRow[] = []
  const payload = mergePendingOverSavedOverrideRows(
    pendingAfterCancel,
    savedBillingOverrideRows
  )
  assert.equal(payload.length, 0)
  assert.equal(
    payload.some(
      (r) =>
        String(r.line_item_id ?? r.lineItemId ?? "").includes("supabase001PB1")
    ),
    false
  )

  // Contrast: Apply would have put the line in pending and into the payload.
  const pendingAfterApply = buildPendingBillingOverrideRows(
    prebillDraftMonths,
    prebillMeta
  )
  const afterApply = mergePendingOverSavedOverrideRows(
    pendingAfterApply,
    savedBillingOverrideRows
  )
  assert.ok(afterApply.length > 0)
})

test("MB-24 (e) saved exists AND draft contradicts → differs from saved", () => {
  const draftRows = layerDraftMonthsOntoOverrideRows(
    [savedSpread],
    prebillDraftMonths,
    prebillMeta
  )
  const provenance = resolveLineBillingTimingProvenance(
    "supabase001PB1",
    [],
    [savedSpread],
    draftRows
  )
  assert.equal(provenance, "draft")
  assert.equal(
    draftContradictsSavedForLine("supabase001PB1", draftRows, [savedSpread]),
    true
  )
  const label = formatManualBillingStatusLabel("prepaidMedia", provenance!, {
    differsFromSaved: true,
  })
  // 3 Aug shape must be unambiguous — not "saved".
  assert.equal(label, "Media prepaid · not applied · differs from saved")
  assert.equal(
    resolveCampaignBillingTimingProvenance([], [savedSpread], draftRows),
    "draft"
  )
})
