import assert from "node:assert/strict"
import test from "node:test"

import {
  MANUAL_BILLING_VOCAB,
  manualBillingHeaderLabel,
  prebillStatusLabelFromFlags,
} from "../manualBillingVocabulary.js"

test("MB-9 vocabulary mapping is stable", () => {
  assert.equal(MANUAL_BILLING_VOCAB.manualTiming, "Manual")
  assert.equal(MANUAL_BILLING_VOCAB.prepaidMedia, "Media prepaid")
  assert.equal(MANUAL_BILLING_VOCAB.prepaidMediaAndFee, "Prepaid")
  assert.equal(MANUAL_BILLING_VOCAB.feeAdjusted, "Fee adjusted")
  assert.equal(MANUAL_BILLING_VOCAB.clientPays, "Client pays")
})

test("MB-9 header spacing: 1-vs-N plural", () => {
  assert.equal(manualBillingHeaderLabel(1), "Manual billing — 1 line")
  assert.equal(manualBillingHeaderLabel(2), "Manual billing — 2 lines")
  assert.equal(manualBillingHeaderLabel(0), "Manual billing — 0 lines")
  assert.match(manualBillingHeaderLabel(1), /— 1 line$/)
  assert.doesNotMatch(manualBillingHeaderLabel(1), /—1/)
})

test("MB-9 prebill status words match vocab", () => {
  assert.equal(prebillStatusLabelFromFlags({ prepaid: true }), "Prepaid")
  assert.equal(prebillStatusLabelFromFlags({ mediaPrepaid: true }), "Media prepaid")
  assert.equal(prebillStatusLabelFromFlags({ prepaid: true, mediaPrepaid: true }), "Prepaid")
  assert.equal(prebillStatusLabelFromFlags({}), null)
})
