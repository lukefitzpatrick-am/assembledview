import assert from "node:assert/strict"
import test from "node:test"

import { allocateNextMbaNumber } from "../allocateNextMbaNumber"
import { mbaNumberMatchesClientIdentifier } from "@/lib/auth/mbaNumberMatchesClientIdentifier"
import {
  beginMbaNumberRequest,
  shouldApplyMbaNumberResponse,
  shouldSkipClientChange,
} from "../mbaNumberRequestGate"

test("prefix client is scoped to its own plans only (not a longer sibling id)", () => {
  const existing = ["PEN001", "PEN002", "PENFOLD001", "PENFOLD999"]
  assert.equal(allocateNextMbaNumber(existing, "PEN"), "pen003")
  assert.equal(allocateNextMbaNumber(existing, "PENFOLD"), "penfold1000")
})

test("suffix 999 advances to 1000 (not a silent duplicate via slice(-3))", () => {
  assert.equal(allocateNextMbaNumber(["ACME999"], "ACME"), "acme1000")
  assert.equal(
    allocateNextMbaNumber(["ACME1000", "ACME999"], "ACME"),
    "acme1001"
  )
})

test("generated number is lowercase for an uppercase identifier", () => {
  assert.equal(allocateNextMbaNumber([], "PENFOLD"), "penfold001")
  assert.equal(allocateNextMbaNumber(["PENFOLD021"], "PENFOLD"), "penfold022")
})

test("existing uppercase mba_number still matches via auth matcher", () => {
  assert.equal(mbaNumberMatchesClientIdentifier("PENFOLD001", "penfold"), true)
  assert.equal(mbaNumberMatchesClientIdentifier("penfold001", "PENFOLD"), true)
  // Generation lowercases; auth remains case-insensitive for mixed legacy rows
  const next = allocateNextMbaNumber(["PENFOLD001"], "PENFOLD")
  assert.equal(next, "penfold002")
  assert.equal(mbaNumberMatchesClientIdentifier(next, "PENFOLD"), true)
  assert.equal(mbaNumberMatchesClientIdentifier("PENFOLD001", "PENFOLD"), true)
})

test("identifier with trailing digits (IWD2026) does not bleed into the suffix parse", () => {
  assert.equal(allocateNextMbaNumber(["IWD2026001"], "IWD2026"), "iwd2026002")
})

test("re-selecting the same client skips; empty current does not skip first pick", () => {
  assert.equal(shouldSkipClientChange("42", "42"), true)
  assert.equal(shouldSkipClientChange("42", "99"), false)
  assert.equal(shouldSkipClientChange("", "42"), false)
})

test("two back-to-back selections: only the second token may apply", () => {
  const ref = { current: 0 }
  const firstToken = beginMbaNumberRequest(ref)
  const secondToken = beginMbaNumberRequest(ref)

  const firstClientNumber = allocateNextMbaNumber([], "ALPHA")
  const secondClientNumber = allocateNextMbaNumber([], "BETA")

  // First response lands late — discard
  assert.equal(shouldApplyMbaNumberResponse(firstToken, ref.current), false)
  // Second response is current — apply; name/number agree on BETA
  assert.equal(shouldApplyMbaNumberResponse(secondToken, ref.current), true)
  assert.equal(secondClientNumber, "beta001")
  assert.notEqual(firstClientNumber, secondClientNumber)
  assert.equal(mbaNumberMatchesClientIdentifier(secondClientNumber, "BETA"), true)
  assert.equal(mbaNumberMatchesClientIdentifier(firstClientNumber, "BETA"), false)
})

test("re-select same client: no second begin token when skip wins", () => {
  const ref = { current: 0 }
  beginMbaNumberRequest(ref)
  assert.equal(ref.current, 1)
  if (shouldSkipClientChange("7", "7")) {
    // no second beginMbaNumberRequest
  } else {
    beginMbaNumberRequest(ref)
  }
  assert.equal(ref.current, 1)
})
