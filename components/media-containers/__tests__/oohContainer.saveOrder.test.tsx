/**
 * W5k item 2 (the C-377 lesson): the OOH container hands a page its save rows
 * only. One handler is wired to every callback the plan pages pass; through
 * hydrate and a card edit, every array that reaches the save callback is save
 * rows, and the last write of the save callback after the edit carries the
 * edited money. The wrapper takes no raw-lines callback, so no page can wire
 * raw form lines to its save state. Also pinned: an edited fee-inclusive
 * grid row comes back grossed up by the channel fee, and create's echo of
 * its own save rows is not loaded again (the open card stays open).
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
  getPublishersForOoh: async () => [{ id: 1, publisher_name: "JCDecaux" }],
}))

const { default: OOHContainer } = await import("@/components/media-containers/OOHContainer")

const settle = (ms = 400) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

const line = {
  line_item_id: "tst001OH1",
  line_item: 1,
  attrs: { network: "JCDecaux", format: "large_format", type: "Billboard", size: "48 sheet", placement: "p1" },
  buy_type: "panels",
  bursts: [{ budget: "$1,000.00", buyAmount: "$500.00", startDate: "2026-01-05", endDate: "2026-01-31", calculatedValue: 2 }],
}

describe("OOH hands a page its save rows only (W5k, C-377 lesson)", () => {
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
        <OOHContainer
          clientId="client-1"
          feeooh={10}
          onTotalMediaChange={on("total")}
          onBurstsChange={on("billing")}
          onInvestmentChange={on("investment")}
          onLineItemsChange={on("excel")}
          onMediaLineItemsChange={on("save")}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={["ooh"]}
          initialLineItems={[line]}
        />,
      )
    })
    await settle()
    act(() => (host.querySelector('button[aria-label="Expand details for ooh line item 1"]') as HTMLButtonElement).click())
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
      for (const row of rows) expect(row).toMatchObject({ media_plan_version: 0, line_item_id: "tst001OH1" })
    }
    // The card works panels out from budget and rate: $2,000 at $500 is 4.
    expect(saves.at(-1)![0]).toMatchObject({ totalMedia: 2000, network: "JCDecaux", format: "large_format", placement: "p1" })
    expect((saves.at(-1)![0].bursts as Array<Record<string, unknown>>)[0].calculatedValue).toBe(4)
    expect(calls.map(([name]) => name)).not.toContain("raw")
  }, 30_000)
  function render(media: any[][], initialLineItems: unknown[]) {
    act(() => {
      root.render(
        <OOHContainer
          clientId="client-1"
          feeooh={10}
          onTotalMediaChange={() => {}}
          onBurstsChange={() => {}}
          onInvestmentChange={() => {}}
          onLineItemsChange={() => {}}
          onMediaLineItemsChange={(rows: any[]) => media.push(rows)}
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

  const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!
  const openCards = () => document.querySelectorAll('button[aria-label^="Collapse details for ooh"]').length

  it("gives an edited fee-inclusive row back grossed up by the channel fee on Apply", async () => {
    // $1,100 gross at 10% is $990 net: 10 panels at $99. 5 back is $495 net, $550 gross.
    const media: any[][] = []
    render(media, [{ ...line, budget_includes_fees: true, bursts: [{ budget: "$1,100.00", buyAmount: "$99.00", startDate: "2026-01-05", endDate: "2026-01-11", calculatedValue: 10 }] }])
    await settle()
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.tagName === "THEAD" ? 40 : 2000
      })
    act(() => button("Schedule grid").click())
    await settle(100)
    const grid = document.querySelector('[role="dialog"]') as HTMLElement
    const week = [...grid.querySelectorAll("input")].filter((i) => i.value === "10").pop()
    expect(week, "10 panels in week 1").toBeTruthy()
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(week, "5")
      week!.dispatchEvent(new Event("input", { bubbles: true }))
    })
    act(() => week!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
    await settle(400)
    act(() => button("Apply to plan (not saved yet)").click())
    offsetHeight.mockRestore()
    await settle()
    const [b] = media.at(-1)![0].bursts
    expect([b.budget, b.calculatedValue]).toEqual(["550", 5])
  }, 30_000)

  it("does not load create's echo of its own save rows again, and loads a different array", async () => {
    const media: any[][] = []
    render(media, [])
    await settle()
    act(() => button("Add line item").click())
    await settle()
    if (openCards() === 0) {
      act(() => (host.querySelector('button[aria-label="Expand details for ooh line item 1"]') as HTMLButtonElement).click())
      await settle(50)
    }
    expect(openCards(), "the new card is open").toBe(1)
    const echo = media.at(-1)!
    render(media, echo)
    await settle()
    expect(openCards(), "the echo leaves the card open").toBe(1)
    render(media, [...echo])
    await settle()
    expect(openCards(), "a new array loads, cards collapsed").toBe(0)
  }, 30_000)
})
