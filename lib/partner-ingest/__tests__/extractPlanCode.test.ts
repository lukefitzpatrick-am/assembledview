import assert from "node:assert/strict"
import test from "node:test"

import { extractPlanCode } from "../extractPlanCode"

test("extracts a trailing plan code and lowercases it", () => {
  assert.equal(
    extractPlanCode("CF12_AT1_P18-99_Birthday Hero_BICAU002PV4"),
    "bicau002pv4"
  )
})

test("extracts a code that is not the last underscore token", () => {
  assert.equal(
    extractPlanCode("CF12_AT1_P25-64_3_Lux_PENFOLD018PV1"),
    "penfold018pv1"
  )
})

test("extracts a code after a double underscore", () => {
  assert.equal(
    extractPlanCode("CF14_AT1_P25-64__PENFOLD018PV1"),
    "penfold018pv1"
  )
})

test("extracts a PO plan code from a Vistar contract number", () => {
  assert.equal(extractPlanCode("legal004PO1"), "legal004po1")
  assert.equal(extractPlanCode("Contract LEGAL004PO12 / Jolt"), "legal004po12")
})

test("returns null when the media buy has no plan code", () => {
  assert.equal(extractPlanCode("CF12_AT1_P25-64 (Female List)"), null)
  assert.equal(extractPlanCode("CF12_AT1_P25-64_1"), null)
})

test("does not split on the last underscore to invent a code", () => {
  assert.equal(extractPlanCode("CF12_AT1_P25-64_1"), null)
})
