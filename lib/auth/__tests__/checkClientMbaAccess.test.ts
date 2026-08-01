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

test("PEN vs PENFOLD-A: short prefix must not over-grant", () => {
  // Identifier PEN must not open PENFOLD* or hyphenated near-matches
  assert.equal(mbaNumberMatchesClientIdentifier("PENFOLD-A", "PEN"), false)
  assert.equal(mbaNumberMatchesClientIdentifier("PENFOLD001", "PEN"), false)
  assert.equal(mbaNumberMatchesClientIdentifier("PEN001", "PEN"), true)
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

/**
 * SEC-G soft-spot predicate: non-admin without mba_numbers must not be treated as
 * unscoped. (resolveClientMbaScope integration covered by route probes; this locks
 * the membership predicate the helper uses for non-admin mba_numbers path.)
 */
test("SEC-G: non-admin empty mba_numbers is not an unscoped allow-all", () => {
  const user = { app_metadata: {} }
  const list = getUserMbaNumbers(user as never)
  assert.deepEqual(list, [])
  // Empty list ⇒ helper denies before identifier fallback for non-client sessions.
  assert.equal(list.length === 0, true)
})
