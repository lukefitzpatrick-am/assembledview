import assert from "node:assert/strict"
import test from "node:test"
import {
  escapeRegExp,
  mbaNumberMatchesClientIdentifier,
} from "../mbaNumberMatchesClientIdentifier"
import { getUserMbaNumbers } from "../../rbac"

test("escapeRegExp escapes regex metacharacters", () => {
  assert.equal(escapeRegExp("PENFOLD"), "PENFOLD")
  assert.equal(escapeRegExp("a.b+c"), "a\\.b\\+c")
})

test("PENFOLD identifier allows PENFOLD001 and PENFOLD021", () => {
  assert.equal(mbaNumberMatchesClientIdentifier("PENFOLD001", "PENFOLD"), true)
  assert.equal(mbaNumberMatchesClientIdentifier("PENFOLD021", "PENFOLD"), true)
  assert.equal(mbaNumberMatchesClientIdentifier("penfold001", "PENFOLD"), true)
})

test("no prefix bleed between PENF and PENFOLD", () => {
  // PENF caller must not open PENFOLD* MBAs
  assert.equal(mbaNumberMatchesClientIdentifier("PENFOLD001", "PENF"), false)
  // PENFOLD caller must not open PENF* MBAs
  assert.equal(mbaNumberMatchesClientIdentifier("PENF001", "PENFOLD"), false)
  // PENF + digits is fine for a PENF identifier
  assert.equal(mbaNumberMatchesClientIdentifier("PENF001", "PENF"), true)
})

test("SINCH001 denied for a PENFOLD caller", () => {
  assert.equal(mbaNumberMatchesClientIdentifier("SINCH001", "PENFOLD"), false)
})

test("empty/blank mbaidentifier denies", () => {
  assert.equal(mbaNumberMatchesClientIdentifier("PENFOLD001", ""), false)
  assert.equal(mbaNumberMatchesClientIdentifier("PENFOLD001", "   "), false)
  assert.equal(mbaNumberMatchesClientIdentifier("PENFOLD001", null), false)
  assert.equal(mbaNumberMatchesClientIdentifier("PENFOLD001", undefined), false)
})

test("bare identifier without trailing digits is denied (not startsWith)", () => {
  assert.equal(mbaNumberMatchesClientIdentifier("PENFOLD", "PENFOLD"), false)
  assert.equal(mbaNumberMatchesClientIdentifier("PENFOLDextra", "PENFOLD"), false)
})

/**
 * Preferred path (checkClientMbaAccess L33-47): when app_metadata.mba_numbers is
 * populated, exact list membership wins — fallback identifier match is not used.
 * Assert the same predicate the preferred branch uses.
 */
test("mba_numbers path: exact membership only (preferred branch predicate)", () => {
  const user = {
    app_metadata: { mba_numbers: ["PENFOLD001", "PENFOLD021"] },
  }
  const list = getUserMbaNumbers(user as never)
  assert.deepEqual(list, ["PENFOLD001", "PENFOLD021"])

  const allows = (mbaNumber: string) =>
    list.some((mba) => mba.toLowerCase() === mbaNumber.toLowerCase())

  assert.equal(allows("PENFOLD001"), true)
  assert.equal(allows("penfold021"), true)
  // Not in the list — preferred path denies even if identifier fallback would allow
  assert.equal(allows("PENFOLD002"), false)
  assert.equal(allows("SINCH001"), false)
})
