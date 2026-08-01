import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  matchText,
  matchTextAny,
  normalizeSearchText,
  tokenizeSearchQuery,
} from "../matchText"

describe("normalizeSearchText / tokenizeSearchQuery", () => {
  it("lowercases, strips diacritics, collapses whitespace", () => {
    assert.equal(normalizeSearchText("  Café  Noël "), "cafe noel")
    assert.deepEqual(tokenizeSearchQuery("  Mitch   Win "), ["mitch", "win"])
  })

  it("coerces null / undefined / numbers via String(x ?? \"\")", () => {
    assert.equal(normalizeSearchText(null), "")
    assert.equal(normalizeSearchText(undefined), "")
    assert.equal(normalizeSearchText(1001), "1001")
    assert.equal(normalizeSearchText("001001"), "001001")
  })
})

describe("matchText", () => {
  it("empty query matches any haystack including empty", () => {
    assert.equal(matchText("anything", ""), true)
    assert.equal(matchText("anything", "   "), true)
    assert.equal(matchText("", ""), true)
    assert.equal(matchText(null, ""), true)
  })

  it("token-prefix AND: mitch win → Mitchelton Winery", () => {
    assert.equal(matchText("Mitchelton Winery", "mitch win"), true)
    assert.equal(matchText("Mitchelton Winery", "MITCH WIN"), true)
    assert.equal(matchText("Mitchelton Winery", "mitch lost"), false)
    assert.equal(matchText("Mitchelton", "mitch win"), false)
  })

  it("diacritic-insensitive", () => {
    assert.equal(matchText("Café Noël", "cafe noel"), true)
    assert.equal(matchText("Jose", "josé"), true)
  })

  it("empty/null haystack does not match non-empty query", () => {
    assert.equal(matchText("", "x"), false)
    assert.equal(matchText(null, "x"), false)
    assert.equal(matchText(undefined, "x"), false)
  })

  it("001001 numeric-identity: string stays string; number coerces without throw", () => {
    assert.equal(matchText("001001", "001001"), true)
    assert.equal(matchText("001001", "1001"), true)
    assert.doesNotThrow(() => matchText(1001 as unknown as string, "001001"))
    // Number 1001 → "1001"; query "001001" is not a prefix/substring of "1001"
    assert.equal(matchText(1001, "1001"), true)
    assert.equal(matchText(1001, "001001"), false)
  })
})

describe("matchTextAny", () => {
  it("ORs across fields with multi-token AND per field", () => {
    assert.equal(
      matchTextAny(["Mitchelton Winery", "Brand"], "mitch win"),
      true
    )
    assert.equal(matchTextAny(["Other", "Brand"], "mitch win"), false)
    assert.equal(matchTextAny([null, "jayco001"], "jay"), true)
  })
})
