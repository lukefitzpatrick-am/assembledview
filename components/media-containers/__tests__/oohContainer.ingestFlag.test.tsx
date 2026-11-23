/**
 * W5k fix (C-382): the ingest page's one-shot "open the schedule grid" flag
 * is read only once OOH has lines. Before, the first effect ran on the empty
 * form, read and cleared the flag, and the grid never opened.
 *
 * W5l adds the two cases the W5k review left unpinned: the gate belongs to
 * OOH, so a Radio mount with the flag set keeps its cards; and once the
 * planner has the grid open the auto-open latches, so closing it does not
 * open it again from the same flag.
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { consumeIngestOohExpertPreference, writeIngestOohExpertPreference } from "@/lib/mediaplans/ingest/oohLargeFormatExpertGate"
import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForOoh: async () => [{ id: 1, publisher_name: "JCDecaux" }],
  getPublishersForRadio: async () => [{ id: 2, publisher_name: "Nova" }],
  getRadioStations: async () => [],
}))

const { default: OOHContainer } = await import("@/components/media-containers/OOHContainer")
const { default: RadioContainer } = await import("@/components/media-containers/RadioContainer")

const settle = (ms = 300) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

// Five lines with no `buy_granularity`: the panel count alone would not open the grid.
const lines = Array.from({ length: 5 }, (_, i) => ({
  line_item_id: `tst001OH${i + 1}`,
  line_item: i + 1,
  network: "JCDecaux",
  format: "large_format",
  buy_type: "panels",
  placement: `p${i + 1}`,
  bursts: [{ budget: "$1,000.00", buyAmount: "$500.00", startDate: "2026-01-05", endDate: "2026-01-31", calculatedValue: 2 }],
}))

describe("OOH opens the schedule grid after a large-format ingest accept (C-382)", () => {
  let host: HTMLDivElement
  let root: Root

  beforeAll(() => {
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Element.prototype.scrollIntoView ??= () => {}
  })

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    window.sessionStorage.clear()
    resetWeekStartsOnStore()
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "THEAD" ? 40 : 2000
    })
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  function render(initialLineItems: unknown[]) {
    act(() => {
      root.render(
        <OOHContainer
          clientId="client-1"
          feeooh={10}
          onTotalMediaChange={() => {}}
          onBurstsChange={() => {}}
          onInvestmentChange={() => {}}
          onLineItemsChange={() => {}}
          onMediaLineItemsChange={() => {}}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={["ooh"]}
          initialLineItems={initialLineItems}
        />,
      )
    })
  }

  const gridOpen = () => document.querySelector('[role="dialog"]') !== null

  it("opens the grid once the lines load, with the lines there at mount", async () => {
    writeIngestOohExpertPreference(true)
    render(lines)
    await settle()
    expect(gridOpen()).toBe(true)
    expect(consumeIngestOohExpertPreference(), "the flag is spent").toBe(false)
  }, 30_000)

  it("keeps the flag while there are no lines, then opens the grid when they arrive", async () => {
    writeIngestOohExpertPreference(true)
    render([])
    await settle()
    expect(gridOpen(), "no lines: no grid").toBe(false)
    render(lines)
    await settle()
    expect(gridOpen()).toBe(true)
  }, 30_000)

  it("leaves the cards with no flag and no large-format lines", async () => {
    render(lines)
    await settle()
    expect(gridOpen()).toBe(false)
  }, 30_000)

  it("latches once the grid is open, so closing it does not reopen it", async () => {
    render(lines)
    await settle()
    const click = (text: string) =>
      act(() =>
        [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!.click(),
      )
    click("Schedule grid")
    await settle()
    expect(gridOpen(), "opened by hand").toBe(true)
    writeIngestOohExpertPreference(true)
    click("Card entry")
    await settle()
    expect(gridOpen(), "the planner keeps the cards").toBe(false)
    expect(consumeIngestOohExpertPreference(), "the flag is left for the next mount").toBe(true)
  }, 30_000)

  it("ignores the flag on another channel", async () => {
    writeIngestOohExpertPreference(true)
    act(() => {
      root.render(
        <RadioContainer
          clientId="client-1"
          feeradio={10}
          onTotalMediaChange={() => {}}
          onBurstsChange={() => {}}
          onInvestmentChange={() => {}}
          onLineItemsChange={() => {}}
          onMediaLineItemsChange={() => {}}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={["radio"]}
          initialLineItems={[
            {
              line_item_id: "tst001RA1",
              line_item: 1,
              network: "Nova",
              buy_type: "spots",
              bursts: [{ budget: "$1,000.00", buyAmount: "$50.00", startDate: "2026-01-05", endDate: "2026-01-31", calculatedValue: 20 }],
            },
          ]}
        />,
      )
    })
    await settle()
    expect(gridOpen(), "Radio keeps its cards").toBe(false)
    expect(consumeIngestOohExpertPreference(), "and leaves the flag for OOH").toBe(true)
  }, 30_000)
})
