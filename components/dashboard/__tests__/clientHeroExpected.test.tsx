/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { formatMoneyCompact } from "@/lib/format/money"

import { HeroBanner } from "../HeroBanner"
import { HeroKPIBar } from "../HeroKPIBar"

const FIGURE = 500_000
const formatted = formatMoneyCompact(FIGURE)

const bannerActions = {
  onOpenDetails: () => {},
  onOpenFinance: () => {},
  onOpenKPIs: () => {},
}

describe("client dashboard expected media", () => {
  it("hides the figure in the header and the tile until it is final", () => {
    const header = renderToStaticMarkup(
      <HeroBanner
        clientName="Krusty Krab"
        totalSpend={FIGURE}
        spendLabel="Expected media to date"
        spendLoading
        activeCampaigns={0}
        {...bannerActions}
      />,
    )
    const tile = renderToStaticMarkup(
      <HeroKPIBar
        totalSpend={FIGURE}
        totalBudget={FIGURE}
        spendLabel="Expected media to date"
        spendLoading
        liveCampaigns={0}
        plannedCampaigns={2}
        budgetUtilized={0}
      />,
    )

    expect(header.includes(formatted)).toBe(false)
    expect(tile.includes(formatted)).toBe(false)
    expect(header).toContain("Expected media to date loading")
    expect(tile).toContain("Expected media to date loading")
  })

  it("prints the same expected figure in the header and the tile", () => {
    const toDate = formatMoneyCompact(0)
    const header = renderToStaticMarkup(
      <HeroBanner
        clientName="Krusty Krab"
        totalSpend={0}
        spendLabel="Expected media to date"
        activeCampaigns={0}
        {...bannerActions}
      />,
    )
    const tile = renderToStaticMarkup(
      <HeroKPIBar
        totalSpend={0}
        totalBudget={FIGURE}
        spendLabel="Expected media to date"
        liveCampaigns={0}
        plannedCampaigns={2}
        budgetUtilized={0}
      />,
    )

    expect(header).toContain(`Expected media to date: ${toDate}`)
    expect(header.includes(formatted)).toBe(false)
    expect(tile).toContain(toDate)
    expect(tile).toContain(`of ${formatted} plan budget`)
  })

  it("greets a client viewer and titles admin and staff with the client name", () => {
    const client = renderToStaticMarkup(
      <HeroBanner
        clientName="Krusty Krab"
        totalSpend={0}
        viewerIsClient
        activeCampaigns={0}
        {...bannerActions}
      />,
    )
    const admin = renderToStaticMarkup(
      <HeroBanner
        clientName="Krusty Krab"
        totalSpend={0}
        activeCampaigns={0}
        isAdmin
        clientHubLayout
        {...bannerActions}
      />,
    )

    expect(client).toContain("Welcome back, Krusty Krab.")
    expect(admin.includes("Welcome back")).toBe(false)
    expect(admin).toContain("Krusty Krab")
    expect(admin.includes("Krusty Krab.")).toBe(false)
  })
})
