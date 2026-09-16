/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { ChannelSection } from "../ChannelSection"
import { DeliveryContainer } from "../DeliveryContainer"
import type { ChannelSectionData } from "../channels/types"
import type { LineItemBlockProps } from "../shared/LineItemBlock"
import type { ProgressCardProps } from "../shared/ProgressCard"

const PROGRESS: ProgressCardProps = {
  title: "Spend",
  value: "$1",
  detail: "detail",
  progress: 0.5,
  variance: 0,
  status: "on-track",
}

function lineBlock(name: string): LineItemBlockProps {
  return {
    name,
    fullName: `tooltip-${name.replace(/^LI-/, "")}`,
    progressCards: [PROGRESS, { ...PROGRESS, title: "Impressions" }],
    kpiBand: { tiles: [] },
    chart: {
      kind: "daily-delivery",
      daily: [],
      series: [{ key: "spend", label: "Spend" }],
      asAtDate: null,
    },
  }
}

function emptyAggregate(): ChannelSectionData["aggregate"] {
  return {
    summaryChips: [],
    progressCards: [PROGRESS, PROGRESS],
    kpiBand: { tiles: [] },
    chart: { daily: [], series: [], asAtDate: null },
  }
}

function programmaticChannel(names: string[]): ChannelSectionData {
  return {
    key: "programmatic-display",
    title: "Programmatic Display",
    dateRange: { startISO: "2026-01-01", endISO: "2026-01-31" },
    lastSyncedAt: null,
    connections: [],
    mediaTypeColour: "#000000",
    aggregate: emptyAggregate(),
    lineItems: names.map((name) => ({
      id: name,
      block: lineBlock(name),
    })),
  }
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1
}

describe.skip("ChannelSection line items (parked until FX2b pack)", () => {
  it("renders three LineItemBlocks expanded with each name appearing once", () => {
    const names = ["LI-Alpha-Unique", "LI-Bravo-Unique", "LI-Charlie-Unique"]
    const html = renderToStaticMarkup(
      <ChannelSection data={programmaticChannel(names)} defaultOpen />,
    )

    expect(html).toContain("Line items (3)")
    for (const name of names) {
      expect(count(html, name), `${name} should appear exactly once`).toBe(1)
      expect(html).toMatch(new RegExp(`<h4[^>]*>${name}</h4>`))
    }
  })
})

describe("ChannelSection programmatic summary", () => {
  it("shows chips and the daily chart above the line list, without mixed deliverable cards", () => {
    const data = programmaticChannel(["LI-Alpha-Unique", "LI-Bravo-Unique"])
    data.aggregate = {
      ...emptyAggregate(),
      summaryChips: [
        { label: "Total spend", value: "$50.00" },
        { label: "Total impressions", value: "10,000" },
        { label: "Avg CPM", value: "$5.00" },
        { label: "Avg delivery", value: "5.0%", caption: "includes modelled spend" },
      ],
      progressCards: [
        { ...PROGRESS, title: "AGGREGATE-SPEND-CARD" },
        { ...PROGRESS, title: "AGGREGATE-DELIVERABLE-CARD" },
      ],
      kpiBand: { title: "AGGREGATE-KPI-BAND", tiles: [] },
      chart: {
        daily: [{ date: "2026-03-01", amount_spent: 10, impressions: 100 }],
        series: [
          { key: "amount_spent", label: "Spend" },
          { key: "impressions", label: "Impressions" },
        ],
        asAtDate: "2026-03-15",
      },
    }

    const html = renderToStaticMarkup(<ChannelSection data={data} defaultOpen />)

    expect(html).toContain("Total spend")
    expect(html).toContain("$50.00")
    expect(html).toContain("includes modelled spend")
    expect(html).toContain("Daily delivery")
    expect(html).toContain("Spend + Impressions")
    expect(html).toContain("Line items (2)")
    expect(html).toContain("LI-Alpha-Unique")
    expect(html).toContain("LI-Bravo-Unique")
    expect(html).not.toContain("AGGREGATE-SPEND-CARD")
    expect(html).not.toContain("AGGREGATE-DELIVERABLE-CARD")
    expect(html).not.toContain("AGGREGATE-KPI-BAND")
  })
})

describe.skip("DeliveryContainer (parked until FX2b pack)", () => {
  it("opens every channel section by default", () => {
    const a = programmaticChannel(["LI-One-Unique"])
    const b: ChannelSectionData = {
      ...programmaticChannel(["LI-Two-Unique"]),
      key: "digital-display",
      title: "Digital Display",
    }
    const html = renderToStaticMarkup(<DeliveryContainer channels={[a, b]} />)
    expect(html).toMatch(/<h4[^>]*>LI-One-Unique<\/h4>/)
    expect(html).toMatch(/<h4[^>]*>LI-Two-Unique<\/h4>/)
  })
})
