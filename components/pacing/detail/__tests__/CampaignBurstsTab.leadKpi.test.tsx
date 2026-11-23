/**
 * The bursts tab's lead KPI reads the burst's own cost per result: CPM is
 * spend ÷ impressions × 1000 and CPC is spend ÷ clicks, both to the cent.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { CampaignBurstsTab } from "@/components/pacing/detail/CampaignBurstsTab"
import { lineCardFromSearch } from "@/lib/pacing/channel/lineCardModel"
import type { LineCardModel } from "@/lib/pacing/channel/lineCardTypes"
import { searchFixture } from "@/lib/pacing/channel/__tests__/fixtures"
import type { CampaignDetailBurst } from "@/lib/pacing/detail/types"

const AS_OF = "2026-03-10"
const line = lineCardFromSearch(searchFixture(), AS_OF)

const burst: CampaignDetailBurst = {
  lineItemId: line.lineItemId,
  index: 0,
  name: "Burst 1",
  start: "2026-03-01",
  end: "2026-03-31",
  days: 31,
  budget: 5_000,
  spend: 1_234.5,
  expected: 1_500,
  pct: 82,
  status: "on_track",
  impressions: 98_765,
  clicks: 3,
  views: 0,
  plannedDeliverable: 0,
  deliveredDeliverable: 0,
  perDayLeft: null,
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function leadKpiText(label: string): string {
  const kpiLine: LineCardModel = { ...line, kpis: [{ label, delivered: "-", target: "$9.00", source: "target", status: null }] }
  act(() =>
    root.render(
      <CampaignBurstsTab
        lines={[kpiLine]}
        bursts={[burst]}
        asOf={AS_OF}
        onPlanScenario={() => {}}
        onDailyWindow={() => {}}
      />,
    ),
  )
  const bar = container.querySelector<HTMLButtonElement>("button.absolute")
  expect(bar).not.toBeNull()
  act(() => bar!.click())
  return container.textContent ?? ""
}

describe("CampaignBurstsTab lead KPI", () => {
  it("CPM is the burst's spend per thousand impressions", () => {
    expect(leadKpiText("CPM")).toContain("$12.50 vs $9.00")
  })

  it("CPC is the burst's spend per click", () => {
    expect(leadKpiText("CPC")).toContain("$411.50 vs $9.00")
  })
})
