import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { shortFormEmailAlias } from "../rosterEmailAlias.js"

describe("shortFormEmailAlias", () => {
  it("maps first.last@domain to first@domain", () => {
    assert.equal(
      shortFormEmailAlias("luke.fitzpatrick@assembledmedia.com.au"),
      "luke@assembledmedia.com.au",
    )
  })

  it("lowercases before matching", () => {
    assert.equal(
      shortFormEmailAlias("Samantha.Jones@AssembledMedia.com.au"),
      "samantha@assembledmedia.com.au",
    )
  })

  it("returns null when the local part is already short-form", () => {
    assert.equal(shortFormEmailAlias("luke@assembledmedia.com.au"), null)
  })

  it("returns null for plus-tags and extra dots", () => {
    assert.equal(shortFormEmailAlias("luke.fitz.patrick@assembledmedia.com.au"), null)
    assert.equal(shortFormEmailAlias("luke+alias@assembledmedia.com.au"), null)
  })

  it("returns null for blank or malformed addresses", () => {
    assert.equal(shortFormEmailAlias(""), null)
    assert.equal(shortFormEmailAlias("not-an-email"), null)
  })
})
