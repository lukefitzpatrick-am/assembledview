import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { rewriteClientSlugFields } from "../rewriteClientSlugFields.js"

describe("rewriteClientSlugFields", () => {
  it("rewrites the singular key and the matching array entry", () => {
    const next = rewriteClientSlugFields(
      {
        role: "client",
        client_slug: "golf-australia",
        client_slugs: ["golf-australia", "pga-australia"],
      },
      "golf-australia",
      "golf-australia-renamed",
    )
    assert.equal(next.client_slug, "golf-australia-renamed")
    assert.deepEqual(next.client_slugs, ["golf-australia-renamed", "pga-australia"])
  })

  it("rewrites a non-primary array entry without moving primary", () => {
    const next = rewriteClientSlugFields(
      {
        client_slug: "pga-australia",
        client_slugs: ["pga-australia", "golf-australia"],
      },
      "golf-australia",
      "golf-australia-renamed",
    )
    assert.equal(next.client_slug, "pga-australia")
    assert.deepEqual(next.client_slugs, ["pga-australia", "golf-australia-renamed"])
  })

  it("leaves a missing client_slugs array alone", () => {
    const next = rewriteClientSlugFields(
      { client_slug: "golf-australia" },
      "golf-australia",
      "golf-australia-renamed",
    )
    assert.equal(next.client_slug, "golf-australia-renamed")
    assert.equal("client_slugs" in next, false)
  })
})
