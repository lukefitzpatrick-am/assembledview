import assert from "node:assert/strict"
import test from "node:test"

import {
  ABN_CHECKSUM_WARNING,
  abnChecksumWarning,
  isAbnBlankOrElevenDigits,
  isValidAbnChecksum,
  normalizeAbn,
} from "@/lib/clients/abn"

// Valid ABNs: the ATO's worked example (51 824 753 556) in several spellings,
// and 34 010 601 911 (already used as a valid ABN in the client form tests).
const VALID = ["51 824 753 556", "51824753556", "51-824-753-556", "51.824.753.556", "51 824 753 556 ", "34 010 601 911"]

test("strips spaces and punctuation", () => {
  assert.equal(normalizeAbn(" 51 824-753.556 "), "51824753556")
  assert.equal(normalizeAbn("(51) 824/753_556"), "51824753556")
  assert.equal(normalizeAbn(null), "")
  assert.equal(normalizeAbn(undefined), "")
  assert.equal(normalizeAbn(51824753556), "51824753556")
})

test("exactly 11 digits or blank", () => {
  assert.equal(isAbnBlankOrElevenDigits(""), true)
  assert.equal(isAbnBlankOrElevenDigits("51824753556"), true)
  assert.equal(isAbnBlankOrElevenDigits("5182475355"), false)
  assert.equal(isAbnBlankOrElevenDigits("518247535560"), false)
  assert.equal(isAbnBlankOrElevenDigits("5182475355A"), false)
})

test("known valid ABNs pass the mod-89 check", () => {
  for (const abn of VALID) assert.equal(isValidAbnChecksum(abn), true, abn)
})

test("a changed digit fails the mod-89 check", () => {
  assert.equal(isValidAbnChecksum("51 824 753 557"), false)
  assert.equal(isValidAbnChecksum("15 824 753 556"), false)
  assert.equal(isValidAbnChecksum("00000000000"), false)
})

test("badly formed values never pass the check", () => {
  for (const abn of ["", "5182475355", "518247535566", "5182475355A", null, undefined]) {
    assert.equal(isValidAbnChecksum(abn), false, String(abn))
  }
})

test("warning only for 11 digits that fail the check", () => {
  assert.equal(abnChecksumWarning("51 824 753 556"), null)
  assert.equal(abnChecksumWarning("51 824 753 557"), ABN_CHECKSUM_WARNING)
  assert.equal(abnChecksumWarning(""), null)
  assert.equal(abnChecksumWarning("123"), null)
})
