/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { CampaignStatusStrip } from "../CampaignStatusStrip"

const FULL = {
  daysElapsed: 12,
  daysInCampaign: 30,
  daysRemaining: 18,
  timeElapsedPct: 40,
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  budget: 100_000,
  actualSpend: 20_000,
  expectedSpend: 40_000,
  deliveredImpressions: 800_000,
  plannedImpressions: 2_000_000,
  hasDelivery: true,
  deliveredAsOf: "2026-01-12",
} as const

function statHtml(html: string, testId: string): string {
  const match = html.match(new RegExp(`data-stat="${testId}"[\\s\\S]*?</div>`))
  return match?.[0] ?? ""
}

describe("CampaignStatusStrip", () => {
  it("renders four stats", () => {
    const html = renderToStaticMarkup(<CampaignStatusStrip {...FULL} />)
    expect(html).toContain("Delivered to date")
    expect(html).toContain("Expected by now")
    expect(html).toContain("Impressions")
    expect(html).toContain("Time elapsed")
    expect(html).toContain('data-stat="delivered-to-date"')
    expect(html).toContain('data-stat="expected-by-now"')
    expect(html).toContain('data-stat="impressions"')
    expect(html).toContain('data-stat="time-elapsed"')
  })

  it("hides impressions without delivery", () => {
    const html = renderToStaticMarkup(
      <CampaignStatusStrip {...FULL} hasDelivery={false} />,
    )
    expect(html).not.toContain("Impressions")
    expect(html).not.toContain('data-stat="impressions"')
    expect(html).toContain("Delivered to date")
    expect(html).toContain("Expected by now")
    expect(html).toContain("Time elapsed")
  })

  it("uses channels reporting caption when coverage totals are set", () => {
    const html = renderToStaticMarkup(
      <CampaignStatusStrip {...FULL} channelsReporting={2} channelsTotal={4} />,
    )
    expect(html).toContain("channels reporting")
    expect(html).not.toContain("all line items")
  })

  it('shows "—" for unset actualSpend', () => {
    const html = renderToStaticMarkup(
      <CampaignStatusStrip {...FULL} actualSpend={undefined} />,
    )
    const delivered = statHtml(html, "delivered-to-date")
    expect(delivered).toContain("—")
    expect(delivered.includes("$20")).toBe(false)
  })

  it("does not say spend is behind by $X when actualSpend is unset", () => {
    const html = renderToStaticMarkup(
      <CampaignStatusStrip
        {...FULL}
        actualSpend={undefined}
        expectedSpend={43_956}
        channelsReporting={undefined}
        channelsTotal={undefined}
      />,
    )
    expect(html).toContain("No delivery reported yet.")
    expect(html).not.toContain("behind the plan by")
    expect(html).not.toContain("Behind plan on spend")
  })

  it("uses N of M channels copy when spend is unknown but coverage is partial", () => {
    const html = renderToStaticMarkup(
      <CampaignStatusStrip
        {...FULL}
        actualSpend={undefined}
        expectedSpend={43_956}
        channelsReporting={2}
        channelsTotal={5}
      />,
    )
    expect(html).toContain(
      "2 of 5 channels are reporting so far, which is why delivered spend looks low.",
    )
    expect(html).not.toContain("behind the plan by")
  })
})
