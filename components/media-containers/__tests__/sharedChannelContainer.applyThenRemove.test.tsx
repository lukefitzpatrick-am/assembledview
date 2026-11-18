/**
 * W5e review F5: after an expert grid Apply and then a Remove, the summary's
 * "Line N" and the Excel rows' `line_item` follow the card order (as the card
 * heading does), without a reload. Apply stamps each line's `position`; a
 * Remove left the old stamps, so the summary read Line 2, Line 3.
 * Screen and Excel number only: save numbers lines by their place.
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
  getPublishersForSearch: async () => [{ id: 1, publisher_name: "Google" }],
}))

const { default: SearchContainer } = await import(
  "@/components/media-containers/SearchContainer"
)

const noop = () => {}

async function settle(ms = 400) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

function buttons(text: string): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")].filter(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement[]
}

function line(n: number) {
  return {
    line_item_id: `tst001SE${n}`,
    line_item: n,
    platform: "Google",
    buy_type: "cpc",
    bursts: [
      { budget: `$${n},000.00`, buyAmount: "$2.00", startDate: "2026-01-05", endDate: "2026-01-31", calculatedValue: n * 500 },
    ],
  }
}

describe("shared container: Apply then Remove keeps line numbers in card order (F5)", () => {
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
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
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

  it("numbers the summary and Excel rows 1 and 2 after Apply and a Remove", async () => {
    let excel: Array<{ line_item?: unknown; line_item_id?: unknown }> = []
    act(() => {
      root.render(
        <SearchContainer
          clientId="client-1"
          feesearch={0}
          onTotalMediaChange={noop}
          onBurstsChange={noop}
          onInvestmentChange={noop}
          onLineItemsChange={(rows: typeof excel) => {
            excel = rows
          }}
          onMediaLineItemsChange={noop}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={[]}
          initialLineItems={[line(1), line(2), line(3)]}
        />,
      )
    })
    await settle()

    act(() => buttons("Schedule grid")[0]!.click())
    await settle(100)
    const apply = buttons("Apply to plan (not saved yet)")
    expect(apply.length).toBe(1)
    act(() => apply[0]!.click())
    await settle()

    const remove = buttons("Remove")
    expect(remove.length).toBe(3)
    act(() => remove[0]!.click())
    await settle()

    const labels = [...host.querySelectorAll("span")]
      .map((s) => s.textContent?.trim() ?? "")
      .filter((t) => /^Line \d+$/.test(t))
    expect(labels).toEqual(["Line 1", "Line 2"])
    expect(excel.map((r) => [r.line_item, r.line_item_id])).toEqual([
      [1, "tst001SE2"],
      [2, "tst001SE3"],
    ])
  }, 30_000)
})
