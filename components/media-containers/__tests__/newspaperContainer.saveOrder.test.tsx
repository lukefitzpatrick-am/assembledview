/**
 * W5i item 2 (the C-377 lesson): the Newspaper container hands a page its
 * save rows only. One handler is wired to every callback the plan pages
 * pass; through hydrate and a card edit, every array that reaches the save
 * callback is save rows, and the last write of the save callback after the
 * edit carries the edited money. The wrapper takes no raw-lines callback, so
 * no page can wire raw form lines to its save state.
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
  getPublishersForNewspapers: async () => [{ id: 1, publisher_name: "News Corp" }],
  getNewspapers: async () => [{ id: 1, title: "Herald Sun", network: "News Corp" }],
  getNewspapersAdSizes: async () => [{ id: 1, adsize: "Full Page" }],
}))

const { default: NewspaperContainer } = await import("@/components/media-containers/NewspaperContainer")

const settle = (ms = 400) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

const line = {
  line_item_id: "tst001NP1",
  line_item: 1,
  network: "News Corp",
  title: "Herald Sun",
  size: "Full Page",
  buy_type: "insertions",
  placement: "p1",
  bursts: [{ budget: "$1,000.00", buyAmount: "$500.00", startDate: "2026-01-05", endDate: "2026-01-31" }],
}

describe("Newspaper hands a page its save rows only (W5i, C-377 lesson)", () => {
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

  it("every save callback write is save rows, through hydrate and a card edit", async () => {
    const calls: Array<[string, unknown]> = []
    // One handler on every callback the pages pass, tagged by name.
    const on = (name: string) => (...args: unknown[]) => calls.push([name, args.length > 1 ? args : args[0]])
    act(() => {
      root.render(
        <NewspaperContainer
          clientId="client-1"
          feenewspapers={10}
          onTotalMediaChange={on("total")}
          onBurstsChange={on("billing")}
          onInvestmentChange={on("investment")}
          onLineItemsChange={on("excel")}
          onMediaLineItemsChange={on("save")}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={["newspaper"]}
          initialLineItems={[line]}
        />,
      )
    })
    await settle()
    act(() => (host.querySelector('button[aria-label="Expand details for newspaper line item 1"]') as HTMLButtonElement).click())
    await settle(50)
    const budget = host.querySelector('input[name$=".0.bursts.0.budget"]') as HTMLInputElement
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(budget, "2000")
      budget.dispatchEvent(new Event("input", { bubbles: true }))
    })
    act(() => budget.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
    await settle()

    const saves = calls.filter(([name]) => name === "save").map(([, rows]) => rows as Array<Record<string, unknown>>)
    expect(saves.length).toBeGreaterThan(1)
    for (const rows of saves) {
      for (const row of rows) expect(row).toMatchObject({ media_plan_version: 0, line_item_id: "tst001NP1" })
    }
    expect(saves.at(-1)![0]).toMatchObject({ totalMedia: 2000, title: "Herald Sun", size: "Full Page" })
    expect(calls.map(([name]) => name)).not.toContain("raw")
  }, 30_000)
})
