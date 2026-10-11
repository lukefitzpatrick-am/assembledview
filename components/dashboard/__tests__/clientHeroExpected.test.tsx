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

  it("names the campaign budget when the delivery schedule has no months", () => {
    const tile = renderToStaticMarkup(
      <HeroKPIBar
        totalSpend={0}
        totalBudget={FIGURE}
        spendLabel="Expected media to date"
        liveCampaigns={0}
        plannedCampaigns={1}
        budgetUtilized={0}
        budgetCaption="campaign"
      />,
    )
    expect(tile).toContain(`of ${formatted} campaign budget`)
    expect(tile.includes("monthly plan prorated to date")).toBe(false)
  })

  it("paints plan committed at its computed percent on first render", () => {
    const tile = renderToStaticMarkup(
      <HeroKPIBar
        totalSpend={0}
        totalBudget={FIGURE}
        spendLabel="Expected media to date"
        liveCampaigns={0}
        plannedCampaigns={1}
        budgetUtilized={0}
      />,
    )
    const committed = renderToStaticMarkup(
      <HeroKPIBar
        totalSpend={159_800}
        totalBudget={200_000}
        spendLabel="Expected media to date"
        liveCampaigns={1}
        plannedCampaigns={0}
        budgetUtilized={37.5}
      />,
    )
    expect(tile).toContain("0.0%")
    expect(committed).toContain("37.5%")
    expect(committed.includes("0.0%")).toBe(false)
    expect(committed.includes("text-amber-")).toBe(false)
    expect(committed).toContain("text-foreground")
    expect(committed).toContain("bg-pacing-behind")
  })

  it("renders the client name and the expected-to-date lede", () => {
    const header = renderToStaticMarkup(
      <HeroBanner
        clientName="Golf Australia"
        totalSpend={159_800}
        spendLabel="Expected media to date"
        activeCampaigns={4}
        clientHubLayout
        {...bannerActions}
      />,
    )
    expect(header).toContain("Golf Australia")
    expect(header).toContain(`Expected media to date: ${formatMoneyCompact(159_800)}`)
    expect(header.includes("Welcome back")).toBe(false)
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
