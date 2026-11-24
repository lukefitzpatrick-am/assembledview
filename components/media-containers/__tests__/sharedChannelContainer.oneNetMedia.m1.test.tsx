/**
 * M1: the shared channel hook's save row totalMedia reads `one_net_media`
 * from the browser switch snapshot. Off: the old local split. On:
 * computeBurstAmounts, so a cent-edge budget lands on the other float and a
 * bonus line saves 0.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { setClientFeatureSnapshot } from "@/lib/features/client"
import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForSearch: async () => [{ id: 1, publisher_name: "Google" }],
}))

const { default: SearchContainer } = await import("@/components/media-containers/SearchContainer")

const line = (n: number, extra: Record<string, unknown>) => ({
  line_item_id: `tst001SE${n}`,
  line_item: n,
  platform: "Google",
  bid_strategy: "manual_cpc",
  buy_type: "cpc",
  creative_targeting: "t",
  creative: "c",
  buying_demo: "P18+",
  market: "National",
  fixed_cost_media: false,
  client_pays_for_media: false,
  budget_includes_fees: false,
  no_adserving: false,
  ...extra,
})

const LINES = [
  // 0.35 at 10%: 0.31499999999999995 by the old split, 0.315 by computeBurstAmounts.
  line(1, { budget_includes_fees: true, bursts: [{ budget: "$0.35", buyAmount: "$1.00", startDate: "2026-01-12", endDate: "2026-01-31" }] }),
  line(2, { buy_type: "bonus", bursts: [{ budget: "$500.00", buyAmount: "$1.00", startDate: "2026-01-12", endDate: "2026-01-31", calculatedValue: 10 }] }),
]

let host: HTMLDivElement
let root: Root
let media: Array<{ totalMedia: number }> | null

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
})

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.clear()
  resetWeekStartsOnStore()
  media = null
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  setClientFeatureSnapshot(null)
})

async function savedTotals(): Promise<number[]> {
  act(() => {
    root.render(
      <SearchContainer
        clientId="client-1"
        feesearch={10}
        onTotalMediaChange={() => {}}
        onBurstsChange={() => {}}
        onInvestmentChange={() => {}}
        onLineItemsChange={() => {}}
        onMediaLineItemsChange={(items: Array<{ totalMedia: number }>) => {
          media = items
        }}
        campaignStartDate={new Date(2026, 0, 5)}
        campaignEndDate={new Date(2026, 2, 31)}
        campaignBudget={100000}
        campaignId=""
        mediaTypes={["search"]}
        initialLineItems={LINES}
      />,
    )
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 450))
  })
  expect(media).not.toBeNull()
  return media!.map((row) => row.totalMedia)
}

describe("shared channel hook totalMedia and one_net_media", () => {
  it("off: the old local split, and a bonus line keeps its budget", async () => {
    expect(await savedTotals()).toEqual([0.31499999999999995, 500])
  })

  it("on: computeBurstAmounts deliveryMediaAmount, and a bonus line saves 0", async () => {
    setClientFeatureSnapshot({ one_net_media: true })
    expect(await savedTotals()).toEqual([0.315, 0])
  })
})
