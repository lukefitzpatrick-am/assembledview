import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ElementBoundary, builtFromLine } from "@/components/dashboard/web/WebReportView"

describe("web report viewer", () => {
  it("names the property, the site without its protocol, and AV paid media", () => {
    assert.equal(
      builtFromLine("HartmannDirect AU GA4", "https://www.molicare.au/"),
      "Built from Google Analytics 4 (HartmannDirect AU GA4), Search Console (molicare.au) and AV paid media.",
    )
    assert.equal(
      builtFromLine("372647707", "sc-domain:golf.org.au"),
      "Built from Google Analytics 4 (372647707), Search Console (golf.org.au) and AV paid media.",
    )
  })

  it("leaves out an unlinked source", () => {
    assert.equal(builtFromLine(null, "https://www.molicare.au/"), "Built from Search Console (molicare.au) and AV paid media.")
    assert.equal(builtFromLine(null, null), "Built from AV paid media.")
  })

  it("isolates a thrown element from its siblings", () => {
    assert.deepEqual(ElementBoundary.getDerivedStateFromError(), { failed: true })
  })
})
