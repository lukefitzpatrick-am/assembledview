import assert from "node:assert/strict"
import test from "node:test"

import {
  humaniseBillingSaveError,
  isBillingSaveGateError,
  withMbaScopeLineLabels,
} from "@/lib/finance/humaniseBillingSaveError"

test("humaniseBillingSaveError branches on code", () => {
  assert.equal(
    humaniseBillingSaveError({
      code: "BILLING_OVERRIDE_SUM_VIOLATION",
      sumViolations: [{ message: "Line A: bad" }, { message: "Line B: bad" }],
    }),
    "Line A: bad\nLine B: bad"
  )
  assert.equal(
    humaniseBillingSaveError({
      code: "BILLING_SCHEDULE_DIVERGENCE",
      userMessage: "Human divergence",
      error: "raw",
    }),
    "Human divergence"
  )
  assert.equal(
    humaniseBillingSaveError({ code: "BILLING_RECOMPUTE_MISSING_LINE_ITEMS", error: "raw" }),
    "Couldn't recompute billing — reopen MBA & billing and try again."
  )
  assert.equal(
    humaniseBillingSaveError({ error: "verbatim", message: "msg" }),
    "verbatim"
  )
})

test("isBillingSaveGateError recognises finance codes", () => {
  assert.equal(isBillingSaveGateError({ code: "BILLING_SCHEDULE_DIVERGENCE" }), true)
  assert.equal(isBillingSaveGateError({ code: "OTHER" }), false)
})

test("withMbaScopeLineLabels stamps title, falls back to id", () => {
  const labeled = withMbaScopeLineLabels(
    [{ lineItemId: "a" }, { lineItemId: "b" }],
    [{ lineItemId: "a", title: "Google Brand" }]
  )
  assert.equal(labeled[0].label, "Google Brand")
  assert.equal(labeled[1].label, "b")
})
