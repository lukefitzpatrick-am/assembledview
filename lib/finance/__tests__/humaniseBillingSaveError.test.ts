import assert from "node:assert/strict"
import test from "node:test"

import {
  humaniseBillingSaveError,
  isBillingSaveGateError,
  withMbaScopeLineLabels,
} from "@/lib/finance/humaniseBillingSaveError"
import { formatAUD } from "@/lib/format/money"

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
    humaniseBillingSaveError({
      code: "PLANC_C3_SCHEDULE_REQUIRED",
      userMessage: "Radio and OOH have line items but no billing schedule was saved",
      error: "raw",
    }),
    "Radio and OOH have line items but no billing schedule was saved"
  )
  assert.equal(
    humaniseBillingSaveError({ error: "verbatim", message: "msg" }),
    "verbatim"
  )
})

test("humaniseBillingSaveError names adserving component from delta lines", () => {
  const msg = humaniseBillingSaveError({
    code: "BILLING_SCHEDULE_DIVERGENCE",
    error: "raw",
    delta: {
      lines: [
        {
          lineItemId: "OH3",
          field: "adserving",
          delta: 141,
          label: "OH3",
        },
      ],
    },
  })
  assert.equal(msg, `Ad serving on line OH3 differs from the approved MBA by ${formatAUD(141)}`)
})

test("isBillingSaveGateError recognises finance codes", () => {
  assert.equal(isBillingSaveGateError({ code: "BILLING_SCHEDULE_DIVERGENCE" }), true)
  assert.equal(isBillingSaveGateError({ code: "PLANC_C3_SCHEDULE_REQUIRED" }), true)
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
