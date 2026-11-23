/**
 * W5h: Television on the shared shell, what a planner and a screen reader
 * get. Every button has a name, and icon buttons name their line (Add
 * Station, burst Add, Duplicate and Remove), and so does each burst's Budget; every card field label names
 * its control, the TARPs field's too. Only bonus locks a burst's money
 * (package inclusions keeps it, as Television always did). The summary adds
 * each line's TARPs and labels cpt lines "tarps". Closing the grid with an
 * edit asks "Leave Television Expert Mode?" (W5g review F4).
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
  getPublishersForTelevision: async () => [{ id: 1, publisher_name: "Seven" }],
  getTVStations: async () => [{ id: 1, station: "7", network: "Seven" }],
  createTVStation: async (data: { station: string; network: string }) => ({ id: 9, ...data }),
}))

const { default: TelevisionContainer } = await import("@/components/media-containers/TelevisionContainer")

const noop = () => {}

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

const burst = (extra: Record<string, unknown>) => ({
  budget: "$1,000.00",
  buyAmount: "$10.00",
  startDate: "2026-01-05",
  endDate: "2026-01-31",
  size: "30s",
  ...extra,
})

const lines = [
  { line_item_id: "tst001TV1", line_item: 1, network: "Seven", station: "7", buy_type: "cpt", placement: "p1", bursts: [burst({ tarps: "100" }), burst({ tarps: "120.4" })] },
  { line_item_id: "tst001TV2", line_item: 2, network: "Seven", station: "7", buy_type: "bonus", placement: "p2", bursts: [burst({ budget: "0", tarps: "120", calculatedValue: 50 })] },
  { line_item_id: "tst001TV3", line_item: 3, buy_type: "package_inclusions", placement: "p3", bursts: [burst({ budget: "$500.00", tarps: "" })] },
]

describe("Television on the shared shell: names, labels, TARPs and the exit confirm (W5h)", () => {
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
    vi.restoreAllMocks()
  })

  async function mount(expand: number[]) {
    act(() => {
      root.render(
        <TelevisionContainer
          clientId="client-1"
          feetelevision={10}
          onTotalMediaChange={noop}
          onBurstsChange={noop}
          onInvestmentChange={noop}
          onLineItemsChange={noop}
          onTelevisionLineItemsChange={noop}
          onMediaLineItemsChange={noop}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={[]}
          initialLineItems={lines}
        />,
      )
    })
    await settle()
    for (const n of expand) {
      const toggle = host.querySelector(`button[aria-label="Expand details for television line item ${n}"]`) as HTMLButtonElement
      expect(toggle, `expand ${n}`).toBeTruthy()
      act(() => toggle.click())
    }
    await settle(50)
  }

  const named = (selector: string) => host.querySelectorAll(`button[aria-label="${selector}"]`).length

  it("names every button and icon button by its line, and ties every card label to its control", async () => {
    await mount([1, 2, 3])
    for (const n of [1, 2, 3]) {
      expect(named(`Add a TV station for line ${n}`), `station line ${n}`).toBe(1)
      expect(named(`Add burst to line ${n}`), `add burst line ${n}`).toBe(lines[n - 1].bursts.length)
      expect(named(`Duplicate burst on line ${n}`), `duplicate burst line ${n}`).toBe(lines[n - 1].bursts.length)
    }
    expect(named("Remove burst 2 from line 1")).toBe(1)
    expect(named("Remove burst 1 from line 3")).toBe(1)
    const budgets = [...host.querySelectorAll<HTMLInputElement>('input[name$=".budget"]')].filter((i) => /bursts\.\d+\.budget$/.test(i.name))
    expect(budgets.map((i) => i.getAttribute("aria-label"))).toEqual(["Budget, burst 1, line 1", "Budget, burst 2, line 1", "Budget, burst 1, line 2", "Budget, burst 1, line 3"])

    const labelled = new Set([...host.querySelectorAll("label")].map((l) => l.htmlFor).filter(Boolean))
    const nameless = [...host.querySelectorAll("button")].filter(
      (b) => !b.textContent?.trim() && !b.getAttribute("aria-label") && !labelled.has(b.id),
    )
    expect(nameless.map((b) => b.outerHTML.slice(0, 80)), "buttons with no name").toEqual([])

    const labels = [...host.querySelectorAll("label")]
    expect(labels.length).toBeGreaterThan(30)
    for (const l of labels) {
      expect(l.htmlFor && document.getElementById(l.htmlFor), `label "${l.textContent?.trim()}" names a control`).toBeTruthy()
    }
    // Each card's line TARPs field, and the TARPs field of each cpt burst.
    expect(labels.filter((l) => l.textContent?.trim() === "TARPs").length).toBe(3 + 2)
  }, 30_000)

  it("locks money on bonus only, and adds each line's TARPs in the summary", async () => {
    await mount([2, 3])
    const budget = (li: number) => host.querySelector(`input[name="lineItems.${li}.bursts.0.budget"]`) as HTMLInputElement
    expect(budget(1).disabled, "bonus budget locked").toBe(true)
    expect(budget(2).disabled, "package inclusions budget open").toBe(false)
    expect(budget(2).value).toBe("$500.00")

    const summary = [...host.querySelectorAll("span")].filter((s) => /media ·/.test(s.textContent ?? ""))
    expect(summary.map((s) => s.textContent?.replace(/^.*· /, ""))).toEqual(["220 tarps", "120 deliverables", "0 deliverables"])
  }, 30_000)

  it("gives an edited fee-inclusive row back grossed up by the channel fee on Apply", async () => {
    // $1,100 gross at 10% is $990 net: 99 TARPs at $10. 50 back is $500 net, $555.56 gross.
    const media: any[][] = []
    act(() => {
      root.render(
        <TelevisionContainer
          clientId="client-1"
          feetelevision={10}
          onTotalMediaChange={noop}
          onBurstsChange={noop}
          onInvestmentChange={noop}
          onLineItemsChange={noop}
          onTelevisionLineItemsChange={noop}
          onMediaLineItemsChange={(items: any[]) => media.push(items)}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={[]}
          initialLineItems={[
            { ...lines[0], budget_includes_fees: true, bursts: [burst({ budget: "$1,100.00", startDate: "2026-01-05", endDate: "2026-01-11", tarps: "99", calculatedValue: 99 })] },
          ]}
        />,
      )
    })
    await settle()
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.tagName === "THEAD" ? 40 : 2000
      })
    const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!
    act(() => button("Schedule grid").click())
    await settle(100)
    const grid = document.querySelector('[role="dialog"]') as HTMLElement
    // The row's TARPs column also reads 99; the week cell comes after it.
    const week = [...grid.querySelectorAll("input")].filter((i) => i.value === "99").pop()
    expect(week, "99 TARPs in week 1").toBeTruthy()
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(week, "50")
      week!.dispatchEvent(new Event("input", { bubbles: true }))
    })
    act(() => week!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
    await settle(400)
    act(() => button("Apply to plan (not saved yet)").click())
    offsetHeight.mockRestore()
    await settle()
    const [b] = media[media.length - 1][0].bursts
    expect([b.budget, b.calculatedValue]).toEqual(["555.56", 50])
  }, 30_000)

  it("asks to leave Television Expert Mode when the grid closes with an edit", async () => {
    await mount([])
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.tagName === "THEAD" ? 40 : 2000
      })
    const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!
    act(() => button("Schedule grid").click())
    await settle(100)
    const grid = document.querySelector('[role="dialog"]') as HTMLElement
    expect(grid.textContent).toContain("Television Expert Mode")
    const cell = [...grid.querySelectorAll("input, textarea")].find((i) => (i as HTMLInputElement).value === "p1") as HTMLTextAreaElement
    const proto = cell instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    act(() => {
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(cell, "p1 edited")
      cell.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await settle(50)
    act(() => button("Card entry").click())
    await settle(50)
    offsetHeight.mockRestore()
    const titles = [...document.querySelectorAll('[role="dialog"] h2')].map((h) => h.textContent?.trim())
    expect(titles).toContain("Leave Television Expert Mode?")
  }, 30_000)
})
