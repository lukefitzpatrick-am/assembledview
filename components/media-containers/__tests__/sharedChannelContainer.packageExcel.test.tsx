/**
 * W5c F2: on a shared channel without `excelPackageKeepsQuantity`, a package
 * line's Excel deliverables are budget ÷ rate, not the saved quantity. The
 * shared rule is C-168 (b), open; this pins it until it is ruled. Integration
 * keeps the saved quantity (its golden pins that).
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForProgDisplay: async () => [{ id: 1, publisher_name: "DV360" }],
}))

const { default: ProgDisplayContainer } = await import(
  "@/components/media-containers/ProgDisplayContainer"
)

const noop = () => {}

async function settle(ms = 400) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

describe("shared channel Excel package rule (W5c F2, C-168 b)", () => {
  let host: HTMLDivElement
  let root: Root

  beforeAll(() => {
    if (!("ResizeObserver" in globalThis)) {
      ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    }
  })

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    resetWeekStartsOnStore()
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("gives a package line budget ÷ rate in Excel, not its saved quantity", async () => {
    let excel: any[] = []
    const packageLine = {
      line_item_id: "tst001PD1",
      line_item: 1,
      platform: "DV360",
      buy_type: "package",
      bursts: [
        {
          budget: "$12,000.00",
          buyAmount: "$1,000.00",
          startDate: "2026-01-05",
          endDate: "2026-01-31",
          calculatedValue: 8,
        },
      ],
    }
    act(() => {
      root.render(
        <ProgDisplayContainer
          clientId="client-1"
          feeprogdisplay={10}
          onTotalMediaChange={noop}
          onBurstsChange={noop}
          onInvestmentChange={noop}
          onLineItemsChange={(items: any[]) => {
            excel = items
          }}
          onMediaLineItemsChange={noop}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={[]}
          initialLineItems={[packageLine]}
        />,
      )
    })
    await settle()
    expect(excel.length).toBe(1)
    expect(excel[0].deliverables).toBe(12)
  }, 30_000)
})
