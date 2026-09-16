/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { KpiReview } from "../KpiReview"
import type { KpiReviewCard } from "@/lib/kpi/kpiReview"

const CARD: KpiReviewCard = {
  key: "social-meta",
  label: "Social · Meta",
  colour: "var(--channel-social)",
  rows: [
    {
      metric: "ctr",
      label: "CTR",
      targetDisplay: "2.00%",
      deliveredDisplay: "1.80%",
      status: "on-track",
      omitted: false,
    },
    {
      metric: "conversion_rate",
      label: "Conv. Rate",
      targetDisplay: "No target set",
      deliveredDisplay: "2.00%",
      status: "no-data",
      omitted: true,
    },
  ],
}

describe("KpiReview", () => {
  it("renders a card per group with target, delivered, and status", () => {
    const html = renderToStaticMarkup(<KpiReview cards={[CARD]} isAdmin />)
    expect(html).toContain("KPI review")
    expect(html).toContain("Social · Meta")
    expect(html).toContain("CTR")
    expect(html).toContain("2.00%")
    expect(html).toContain("1.80%")
    expect(html).toContain("On track")
    expect(html).not.toContain("Admin preview")
  })

  it("hides omitted no-target rows from clients and greys them for admins", () => {
    const client = renderToStaticMarkup(<KpiReview cards={[CARD]} isAdmin={false} />)
    expect(client).toContain("CTR")
    expect(client).not.toContain("Conv. Rate")
    expect(client).not.toContain("No target set")

    const admin = renderToStaticMarkup(<KpiReview cards={[CARD]} isAdmin />)
    expect(admin).toContain("Conv. Rate")
    expect(admin).toContain("No target set")
    expect(admin).toContain("opacity-60")
  })
})
