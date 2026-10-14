import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isBrandQuery, queryInBucket } from "../brand"

describe("brand split", () => {
  const terms = ["Golf Australia", "golf.org"]

  it("matches a term inside the query, ignoring case", () => {
    assert.equal(isBrandQuery("golf australia membership", terms), true)
    assert.equal(isBrandQuery("visit GOLF.ORG today", terms), true)
    assert.equal(isBrandQuery("australian open tickets", terms), false)
  })

  it("treats an empty term list as non-brand", () => {
    assert.equal(isBrandQuery("golf australia", []), false)
    assert.equal(queryInBucket("golf australia", [], "non_brand"), true)
    assert.equal(queryInBucket("golf australia", [], "brand"), false)
  })
})
