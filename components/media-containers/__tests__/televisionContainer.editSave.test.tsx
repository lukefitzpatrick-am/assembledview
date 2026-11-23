/**
 * C-377 (W5hfix): the edit page keeps one array of Television lines to save,
 * and fills it from `onMediaLineItemsChange`. The shared hook hands the raw
 * form lines up after the save rows, so a page that wires one handler to both
 * callbacks saves the raw lines. Edit passes a no-op to the raw callback (as
 * for Newspaper and Social); after a card edit the held array is save rows.
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { readFileSync } from "node:fs"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForTelevision: async () => [{ id: 1, publisher_name: "Seven" }],
  getTVStations: async () => [{ id: 1, station: "7", network: "Seven" }],
  createTVStation: async (data: { station: string; network: string }) => ({ id: 9, ...data }),
}))

const { default: TelevisionContainer } = await import("@/components/media-containers/TelevisionContainer")

const noop = () => {}
const settle = (ms = 300) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

const line = {
  line_item_id: "tst001TV1",
  line_item: 1,
  network: "Seven",
  station: "7",
  buy_type: "cpt",
  placement: "p1",
  bursts: [{ budget: "$1,000.00", buyAmount: "$10.00", startDate: "2026-01-05", endDate: "2026-01-31", size: "30s", tarps: "100" }],
}

/** The `onTelevisionLineItemsChange` expression the edit page passes. */
function editPageRawCallback(): string {
  const src = readFileSync("app/mediaplans/mba/[mba_number]/edit/page.tsx", "utf8")
  const tag = src.slice(src.indexOf("<TelevisionContainer"))
  return /onTelevisionLineItemsChange=\{([^\n]*)\}\n/.exec(tag.slice(0, tag.indexOf("/>")))![1]
}

describe("Television on edit saves its save rows after a card edit (C-377)", () => {
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
    resetWeekStartsOnStore()
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  /** Mounts Television with the page's held array; `rawToHeld` wires the raw callback to it too. */
  async function editBudget(rawToHeld: boolean) {
    let held: any[] = []
    const hold = (items: any[]) => {
      held = items
    }
    act(() => {
      root.render(
        <TelevisionContainer
          clientId="client-1"
          feetelevision={10}
          onTotalMediaChange={noop}
          onBurstsChange={noop}
          onInvestmentChange={noop}
          onLineItemsChange={noop}
          onTelevisionLineItemsChange={rawToHeld ? hold : noop}
          onMediaLineItemsChange={hold}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={[]}
          initialLineItems={[line]}
        />,
      )
    })
    await settle()
    act(() => (host.querySelector('button[aria-label="Expand details for television line item 1"]') as HTMLButtonElement).click())
    await settle(50)
    const budget = host.querySelector('input[name="lineItems.0.bursts.0.budget"]') as HTMLInputElement
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(budget, "2000")
      budget.dispatchEvent(new Event("input", { bubbles: true }))
    })
    act(() => budget.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
    await settle()
    return held
  }

  it("edit passes a no-op to the raw callback", () => {
    expect(editPageRawCallback()).toBe("() => {}")
  })

  it("holds save rows after a card edit when the raw callback is a no-op", async () => {
    const [row] = await editBudget(false)
    expect(row).toMatchObject({ media_plan_version: 0, line_item_id: "tst001TV1", totalMedia: 2000 })
    expect(row).not.toHaveProperty("tarps")
  }, 30_000)

  it("holds the raw form lines when one handler takes both (why edit passes a no-op)", async () => {
    const [row] = await editBudget(true)
    expect(row).not.toHaveProperty("media_plan_version")
    expect(row).not.toHaveProperty("totalMedia")
  }, 30_000)
})
