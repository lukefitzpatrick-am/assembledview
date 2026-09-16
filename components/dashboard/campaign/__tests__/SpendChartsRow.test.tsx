/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { formatMoneyCompact } from "@/lib/format/money"

import SpendChartsRow from "../SpendChartsRow"

const SPEND_BY_CHANNEL = [
  { mediaType: "Search", amount: 70_000 },
  { mediaType: "Social", amount: 30_000 },
  { mediaType: "Fees", amount: 10_000 },
]

const MONTHLY_SPEND = [
  {
    month: "Jan 2026",
    data: [
      { mediaType: "Search", amount: 40_000 },
      { mediaType: "Social", amount: 20_000 },
      { mediaType: "Fees", amount: 6_000 },
    ],
  },
  {
    month: "Feb 2026",
    data: [
      { mediaType: "Search", amount: 30_000 },
      { mediaType: "Social", amount: 10_000 },
      { mediaType: "Fees", amount: 4_000 },
    ],
  },
]

describe("SpendChartsRow", () => {
  it("renders The plan header, side-by-side charts, and no summary tiles", () => {
    const html = renderToStaticMarkup(
      <SpendChartsRow spendByChannel={SPEND_BY_CHANNEL} monthlySpendByChannel={MONTHLY_SPEND} />,
    )

    expect(html).toContain("The plan")
    expect(html).toContain(
      `Planned media by channel and month · ${formatMoneyCompact(100_000)} gross media, excludes fees`,
    )
    expect(html).not.toContain("Planned media insights")
    expect(html).not.toContain("Planned to date")
    expect(html).not.toContain("Largest planned channel")
    expect(html).not.toContain("Month with highest planned media")
    expect(html).toContain("Planned media by type")
    expect(html).toContain("Planned media by month")
    expect(html).toContain("md:grid-cols-2")
    expect(html).not.toContain("Planned media by publisher")
    expect(html).toMatchSnapshot()
  })
})
