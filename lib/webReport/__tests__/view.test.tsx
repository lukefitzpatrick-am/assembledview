import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ElementBoundary, builtFromLine } from "@/components/dashboard/web/WebReportView"

describe("web report viewer", () => {
  it("names the property, the site, and AV paid media", () => {
    assert.equal(
      builtFromLine("properties/123", "sc-domain:golf.org.au"),
      "Built from Google Analytics 4 properties/123, Search Console sc-domain:golf.org.au, AV paid media.",
    )
  })

  it("isolates a thrown element from its siblings", () => {
    assert.deepEqual(ElementBoundary.getDerivedStateFromError(), { failed: true })
  })
})
