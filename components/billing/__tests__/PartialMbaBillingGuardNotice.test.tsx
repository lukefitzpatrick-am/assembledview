/**
 * M8 (B21): billing vs delivery guard in the MBA billing window.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PartialMbaBillingGuardNotice } from "@/components/billing/PartialMbaBillingGuardNotice"
import type { PartialMbaGuardResult } from "@/lib/mediaplan/partialMbaBillingVsDelivery"

const empty: PartialMbaGuardResult = {
  months: ["October 2025"],
  rows: [],
  difference: 0,
  expectedDifference: 0,
  unexpectedLineCount: 0,
  laterAdded: [],
}

describe("PartialMbaBillingGuardNotice", () => {
  it("renders nothing with no result or no findings", () => {
    expect(renderToStaticMarkup(<PartialMbaBillingGuardNotice result={null} />)).toBe("")
    expect(renderToStaticMarkup(<PartialMbaBillingGuardNotice result={empty} />)).toBe("")
  })

  it("lists each month and line with both amounts; client pays reads as expected", () => {
    const html = renderToStaticMarkup(
      <PartialMbaBillingGuardNotice
        mediaLabelByKey={{ search: "Search", socialMedia: "Social Media" }}
        result={{
          ...empty,
          rows: [
            {
              monthYear: "February 2026",
              mediaType: "search",
              lineItemId: "billing-search::golf023SE1",
              billing: 0,
              delivery: 9500,
              difference: -9500,
              expected: false,
            },
            {
              monthYear: "February 2026",
              mediaType: "socialMedia",
              lineItemId: "billing-socialMedia::golf023SM1",
              billing: 0,
              delivery: 200,
              difference: -200,
              expected: true,
            },
          ],
          difference: -9500,
          expectedDifference: -200,
          unexpectedLineCount: 1,
        }}
      />
    )
    expect(html).toContain("Billing and delivery differ in the MBA months")
    expect(html).toContain("Search golf023SE1")
    expect(html).toContain("$9,500.00")
    expect(html).toContain("Expected: client pays")
    expect(html).toContain("doesn&#x27;t stop a save")
    expect(html).not.toContain("Added after the partial MBA was set")
  })

  it("lists channels added after the partial MBA was set", () => {
    const html = renderToStaticMarkup(
      <PartialMbaBillingGuardNotice
        result={{
          ...empty,
          laterAdded: [
            { mediaType: "newspaper", lineItemId: "billing-newspaper::PENFOLD020NP1", billing: 300, delivery: 300 },
          ],
        }}
      />
    )
    expect(html).toContain("Added after the partial MBA was set")
    expect(html).toContain("newspaper PENFOLD020NP1: billing $300.00, delivery $300.00")
    expect(html).not.toContain("<table")
  })
})
