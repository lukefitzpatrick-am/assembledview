import assert from "node:assert/strict"
import test from "node:test"

import {
  BILLING_AGENCY_AA,
  BILLING_AGENCY_AM,
  classifyBillingAgency,
} from "../billingAgency.js"

test("classifyBillingAgency maps Advertising Associates to AA", () => {
  assert.equal(classifyBillingAgency(BILLING_AGENCY_AA), "AA")
  assert.equal(classifyBillingAgency(" Advertising Associates "), "AA")
  assert.equal(classifyBillingAgency("ADVERTISING ASSOCIATES"), "AA")
})

test("classifyBillingAgency maps Assembled Media to AM", () => {
  assert.equal(classifyBillingAgency(BILLING_AGENCY_AM), "AM")
  assert.equal(classifyBillingAgency("Assembled Media"), "AM")
})

test("classifyBillingAgency defaults unmatched and empty values to AM", () => {
  assert.equal(classifyBillingAgency(undefined), "AM")
  assert.equal(classifyBillingAgency(null), "AM")
  assert.equal(classifyBillingAgency(""), "AM")
  assert.equal(classifyBillingAgency("unknown agency"), "AM")
  assert.equal(classifyBillingAgency("other"), "AM")
})
