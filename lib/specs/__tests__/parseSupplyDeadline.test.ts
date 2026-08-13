import assert from "node:assert/strict"
import test from "node:test"

import { parseSupplyDeadline } from "../parseSupplyDeadline.js"

test("clean single: N working days before live → min=max=N, business", () => {
  assert.deepEqual(parseSupplyDeadline("5 working days before live"), {
    min_days: 5,
    max_days: 5,
    business_days: true,
  })
  assert.deepEqual(
    parseSupplyDeadline("10 working days before live (allows QA of interactive elements)"),
    { min_days: 10, max_days: 10, business_days: true },
  )
})

test("clean range: N–M working days uses both ends; extra confirm text allowed", () => {
  assert.deepEqual(
    parseSupplyDeadline("5-10 working days before live (confirm per booking)"),
    { min_days: 5, max_days: 10, business_days: true },
  )
  assert.deepEqual(
    parseSupplyDeadline("5–10 working days before live date"),
    { min_days: 5, max_days: 10, business_days: true },
  )
  assert.deepEqual(
    parseSupplyDeadline("10-15 working days before live (allows for editorial review)"),
    { min_days: 10, max_days: 15, business_days: true },
  )
})

test("prose-only: dirty or non-live wording → null (drives nothing)", () => {
  assert.equal(
    parseSupplyDeadline("Typically 3-5 business days before broadcast — confirm with Seven"),
    null,
  )
  assert.equal(parseSupplyDeadline("5 working days prior to campaign start"), null)
  assert.equal(parseSupplyDeadline("Standard OOH lead times apply; confirm per booking"), null)
  assert.equal(parseSupplyDeadline("By the 15th of the month prior to start date"), null)
  assert.equal(
    parseSupplyDeadline("Static requires longer lead time (10-14 working days for production)"),
    null,
  )
  assert.equal(parseSupplyDeadline(""), null)
  assert.equal(parseSupplyDeadline("   "), null)
})
