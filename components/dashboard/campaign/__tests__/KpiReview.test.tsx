/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { KpiReview } from "../KpiReview"
import type { KpiReviewCard } from "@/lib/kpi/kpiReview"

const CARD: KpiReviewCard = {
  key: "social-meta",
  label: "Social · Meta",
  colour: "var(--channel-social)",
  noTargets: false,
  rows: [
    {
      metric: "ctr",
      label: "CTR",
      targetDisplay: "2.00%",
      deliveredDisplay: "1.80%",
      status: "on-track",
      omitted: false,
      targetSource: "target",
    },
    {
      metric: "conversion_rate",
      label: "Conv. Rate",
      targetDisplay: "No target set",
      deliveredDisplay: "2.00%",
      status: "no-data",
      omitted: true,
      targetSource: null,
    },
  ],
}

const BENCHMARK_CARD: KpiReviewCard = {
  ...CARD,
  rows: [
    {
      metric: "ctr",
      label: "CTR",
      targetDisplay: "1.50%",
      deliveredDisplay: "1.80%",
      status: "ahead",
      omitted: false,
      targetSource: "benchmark",
      benchmarkRef: "IAB AU 2025 display",
    },
  ],
}

const EMPTY_CARD: KpiReviewCard = {
  key: "bvod",
  label: "BVOD",
  colour: "var(--channel-bvod)",
  noTargets: true,
  rows: [],
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

  it("captions a CPV plan rate under the target", () => {
    const html = renderToStaticMarkup(
      <KpiReview
        cards={[
          {
            ...CARD,
            rows: [
              {
                metric: "cpv",
                label: "CPV",
                targetDisplay: "$0.09",
                deliveredDisplay: "$0.06",
                status: "ahead",
                omitted: false,
                targetSource: "target",
                targetCaption: "plan rate",
              },
            ],
          },
        ]}
      />,
    )
    expect(html).toContain("plan rate")
    expect(html).not.toContain("plan target")
  })

  it("captions a plan target in the Target column", () => {
    const html = renderToStaticMarkup(<KpiReview cards={[CARD]} isAdmin />)
    expect(html).toContain("plan target")
    expect(html).not.toContain("industry benchmark")
  })

  it("captions an industry benchmark and puts the ref on hover", () => {
    const html = renderToStaticMarkup(<KpiReview cards={[BENCHMARK_CARD]} />)
    expect(html).toContain("industry benchmark")
    expect(html).toContain("IAB AU 2025 display")
    expect(html).not.toContain("plan target")
  })

  it("replaces an all-empty card with a plan-edit line for admins", () => {
    const html = renderToStaticMarkup(
      <KpiReview
        cards={[EMPTY_CARD]}
        isAdmin
        planEditHref="/mediaplans/mba/BICAU002/edit#builder-section-kpis"
      />,
    )
    expect(html).toContain("No KPI targets saved for BVOD.")
    expect(html).toContain("Set targets on the media plan →")
    expect(html).toContain("/mediaplans/mba/BICAU002/edit#builder-section-kpis")
    expect(html).not.toContain("CTR")
    expect(html).not.toContain("KPI targets pending.")
  })

  it("replaces an all-empty card with a pending line for clients", () => {
    const html = renderToStaticMarkup(<KpiReview cards={[EMPTY_CARD]} isAdmin={false} />)
    expect(html).toContain("KPI targets pending.")
    expect(html).not.toContain("Set targets on the media plan")
    expect(html).not.toContain("CTR")
  })
})
