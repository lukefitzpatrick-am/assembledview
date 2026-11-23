/**
 * W5j item 2 (the C-377 lesson): the Magazines container hands a page its
 * save rows only. One handler is wired to every callback the plan pages
 * pass; through hydrate and a card edit, every array that reaches the save
 * callback is save rows, and the last write of the save callback after the
 * edit carries the edited money. The wrapper takes no raw-lines callback, so
 * no page can wire raw form lines to its save state. Also pinned: a new
 * card line saves its network as its publisher, and an edited fee-inclusive
 * grid row comes back grossed up by the channel fee.
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
  getPublishersForMagazines: async () => [{ id: 1, publisher_name: "Are Media" }],
  getMagazines: async () => [{ id: 1, title: "Womens Weekly", network: "Are Media" }],
  getMagazinesAdSizes: async () => [{ id: 1, adsize: "Full Page" }],
}))

const { default: MagazinesContainer } = await import("@/components/media-containers/MagazinesContainer")

const settle = (ms = 400) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

const line = {
  line_item_id: "tst001MG1",
  line_item: 1,
  network: "Are Media",
  title: "Womens Weekly",
  size: "Full Page",
  buy_type: "insertions",
  placement: "p1",
  bursts: [{ budget: "$1,000.00", buyAmount: "$500.00", startDate: "2026-01-05", endDate: "2026-01-31" }],
}

describe("Magazines hands a page its save rows only (W5j, C-377 lesson)", () => {
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
        <MagazinesContainer
          clientId="client-1"
          feemagazines={10}
          onTotalMediaChange={on("total")}
          onBurstsChange={on("billing")}
          onInvestmentChange={on("investment")}
          onLineItemsChange={on("excel")}
          onMediaLineItemsChange={on("save")}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={["magazines"]}
          initialLineItems={[line]}
        />,
      )
    })
    await settle()
    act(() => (host.querySelector('button[aria-label="Expand details for magazines line item 1"]') as HTMLButtonElement).click())
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
      for (const row of rows) expect(row).toMatchObject({ media_plan_version: 0, line_item_id: "tst001MG1" })
    }
    expect(saves.at(-1)![0]).toMatchObject({ totalMedia: 2000, title: "Womens Weekly", size: "Full Page", publisher: "Are Media" })
    expect(calls.map(([name]) => name)).not.toContain("raw")
  }, 30_000)

  function render(media: any[][], initialLineItems: unknown[]) {
    act(() => {
      root.render(
        <MagazinesContainer
          clientId="client-1"
          feemagazines={10}
          onTotalMediaChange={() => {}}
          onBurstsChange={() => {}}
          onInvestmentChange={() => {}}
          onLineItemsChange={() => {}}
          onMediaLineItemsChange={(rows: any[]) => media.push(rows)}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={["magazines"]}
          initialLineItems={initialLineItems}
        />,
      )
    })
  }

  const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!

  it("saves a new card line's network as its publisher", async () => {
    const media: any[][] = []
    render(media, [])
    await settle()
    act(() => button("Add line item").click())
    await settle(50)
    const toggle = host.querySelector('button[aria-label="Expand details for magazines line item 1"]') as HTMLButtonElement | null
    if (toggle) act(() => toggle.click())
    await settle(50)
    const network = [...host.querySelectorAll("label")].find((l) => l.textContent?.trim() === "Network")!.parentElement!.querySelector('[role="combobox"]') as HTMLElement
    act(() => network.click())
    await settle(50)
    act(() => ([...document.querySelectorAll("[cmdk-item]")].find((o) => o.textContent?.trim() === "Are Media") as HTMLElement).click())
    await settle()
    expect(media.at(-1)![0]).toMatchObject({ network: "Are Media", publisher: "Are Media" })
  }, 30_000)

  it("keeps a saved publisher that differs from the line's network (W5j review F1)", async () => {
    const media: any[][] = []
    render(media, [{ ...line, publisher: "Nine" }])
    await settle()
    expect(media.at(-1)![0]).toMatchObject({ network: "Are Media", publisher: "Nine" })
  }, 30_000)

  it("gives an edited fee-inclusive row back grossed up by the channel fee on Apply", async () => {
    // $1,100 gross at 10% is $990 net: 10 insertions at $99. 5 back is $495 net, $550 gross.
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
    expect(week, "10 insertions in week 1").toBeTruthy()
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
})
