import assert from "node:assert/strict"
import test from "node:test"

import { MBA_NUMBER_PATTERN, parseMbaNumber } from "@/lib/mediaplan/mbaNumber"

test("MBA_NUMBER_PATTERN accepts canonical alphanumeric ids", () => {
  assert.equal(MBA_NUMBER_PATTERN.test("MBA123"), true)
  assert.equal(MBA_NUMBER_PATTERN.test("abc456XYZ"), true)
})

test("MBA_NUMBER_PATTERN rejects URL metacharacters", () => {
  for (const bad of ["evil@host", "../admin", "MBA/123", "MBA%201", "a b"]) {
    assert.equal(MBA_NUMBER_PATTERN.test(bad), false, `expected reject: ${bad}`)
  }
})

test("parseMbaNumber trims and validates", () => {
  assert.equal(parseMbaNumber("  MBA123  "), "MBA123")
  assert.equal(parseMbaNumber("evil@host"), null)
  assert.equal(parseMbaNumber(""), null)
})
