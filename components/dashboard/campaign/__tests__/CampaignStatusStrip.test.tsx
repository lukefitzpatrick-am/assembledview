/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { CampaignStatusStrip } from "../CampaignStatusStrip"
import { deliveryStatusFromPct } from "@/lib/pacing/deliveryStatusFromPct"
import { p6FixtureRows } from "@/lib/pacing/portfolio/__tests__/p6Fixture"

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
    expect(html).toContain("Expected media to date")
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
    expect(html).toContain("Expected media to date")
    expect(html).toContain("Time elapsed")
  })

  it("uses channels reporting caption when coverage totals are set", () => {
    const html = renderToStaticMarkup(
      <CampaignStatusStrip {...FULL} channelsReporting={2} channelsTotal={4} />,
    )
    expect(html).toContain("channels reporting")
    expect(html).not.toContain("all line items")
  })

  it("reads impressions against expected to date when that figure is set", () => {
    const html = renderToStaticMarkup(
      <CampaignStatusStrip
        {...FULL}
        expectedImpressions={700_000}
        channelsReporting={2}
        channelsTotal={2}
      />,
    )
    // 800,000 of 700,000 expected: shown uncapped, not as a share of the 2,000,000 plan.
    expect(html).toContain("114% of expected to date (channels reporting)")
    expect(html).not.toContain("40% of planned")
  })

  it("keeps the planned caption when no expected impressions are known", () => {
    const html = renderToStaticMarkup(<CampaignStatusStrip {...FULL} />)
    expect(html).toContain("40% of planned (all line items)")
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

  it("93% of schedule expected is On track", () => {
    const html = renderToStaticMarkup(
      <CampaignStatusStrip {...FULL} budget={200_000} actualSpend={93_000} expectedSpend={100_000} />,
    )
    expect(html).toContain('data-pacing-status="on-track"')
    expect(html).toContain("On track")
    expect(html).not.toContain("Behind plan on spend")
    expect(html).toContain("Delivery is on track against the plan.")
    expect(html).toContain("93% of expected")
  })

  it("85% of schedule expected is Behind", () => {
    const html = renderToStaticMarkup(
      <CampaignStatusStrip {...FULL} actualSpend={85_000} expectedSpend={100_000} />,
    )
    expect(html).toContain('data-pacing-status="behind"')
    expect(html).toContain("Behind plan on spend")
    expect(html).toContain("Spend is behind the plan by")
    expect(html).not.toContain('data-pacing-status="on-track"')
  })

  it("BICAU002-shaped input uses the same status as the portfolio pace", () => {
    const row = p6FixtureRows().find((entry) => entry.mbaNumber === "BICAU002")
    expect(row).toBeTruthy()
    const portfolioBand = deliveryStatusFromPct(row!.spendPct)
    const html = renderToStaticMarkup(
      <CampaignStatusStrip
        {...FULL}
        startDate={row!.startDate}
        endDate={row!.endDate}
        budget={row!.budget}
        actualSpend={row!.spendToDate}
        expectedSpend={row!.expectedToDate}
      />,
    )
    expect(row!.pace).toBe("on_track")
    expect(portfolioBand).toBe("on-track")
    expect(html).toContain('data-pacing-status="on-track"')
    expect(html).toContain("On track")
    expect(html).not.toContain("Behind plan on spend")
  })
})
