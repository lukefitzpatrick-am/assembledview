/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { spendInsightsCaption } from "@/lib/dashboard/spendInsightsCaptions"

import { SpendingInsightsSection } from "../SpendingInsightsSection"

describe("SpendingInsightsSection captions", () => {
  it("renders delivery-schedule-month basis captions with range-filtered totals", () => {
    const total = 43_000
    const html = renderToStaticMarkup(
      <SpendingInsightsSection
        monthlyData={[{ month: "Jul", data: [{ mediaType: "TV", amount: total }] }]}
        monthlySpendByCampaign={[
          { month: "Jul", data: [{ campaignName: "Alpha", amount: total }] },
        ]}
        campaignData={[
          { campaignName: "Alpha", mbaNumber: "MBA1", amount: total, percentage: 100 },
        ]}
        mediaTypeData={[{ mediaType: "TV", amount: total, percentage: 100 }]}
        rangeCaption="2026–27"
        isExactAuFy
      />,
    )

    expect(html).toContain(spendInsightsCaption({ by: "campaign", total }))
    expect(html).toContain(spendInsightsCaption({ by: "type", total }))
    expect(html).toContain(
      spendInsightsCaption({ by: "month", total, rangeLabel: "2026–27" }),
    )
    expect(html.includes("Distribution of spending")).toBe(false)
    expect(html.includes("delivery schedule · planned media")).toBe(false)
  })
})
