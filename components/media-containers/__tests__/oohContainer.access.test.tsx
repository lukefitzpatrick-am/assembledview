/**
 * W5k: OOH on the shared shell, what a planner and a screen reader get.
 * Every button has a name, every card label names its control, and no input
 * on an expanded card is nameless. Burst deliverables inputs name their
 * burst and line. The card summary shows Network and Format, the spend
 * summary groups by Network, Placement, Format and Buy Type and names panels
 * "panels". Over 30 panel lines the cards give way to a named summary with
 * an "Open expert view" button. Closing the grid with an edit asks "Leave
 * OOH Expert Mode?", as the old container did.
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
  getPublishersForOoh: async () => [
    { id: 1, publisher_name: "JCDecaux" },
    { id: 2, publisher_name: "QMS" },
  ],
}))

const { default: OOHContainer } = await import("@/components/media-containers/OOHContainer")

const noop = () => {}

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

const burst = (extra: Record<string, unknown> = {}) => ({
  budget: "$1,000.00",
  buyAmount: "$500.00",
  startDate: "2026-01-05",
  endDate: "2026-01-31",
  ...extra,
})

const line = (n: number, extra: Record<string, unknown> = {}) => ({
  line_item_id: `tst001OH${n}`,
  line_item: n,
  network: "JCDecaux",
  format: "large_format",
  type: "Billboard",
  size: "48 sheet",
  market: "Melbourne",
  buy_type: "panels",
  placement: `p${n}`,
  bursts: [burst(), burst()],
  ...extra,
})

const lines = [line(1), line(2, { network: "QMS", buy_type: "bonus", bursts: [burst({ calculatedValue: 5 })] })]

describe("OOH on the shared shell: names, labels and the large-format gate (W5k)", () => {
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
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  async function mount(expand: number[], initialLineItems: unknown[] = lines) {
    act(() => {
      root.render(
        <OOHContainer
          clientId="client-1"
          feeooh={10}
          onTotalMediaChange={noop}
          onBurstsChange={noop}
          onInvestmentChange={noop}
          onLineItemsChange={noop}
          onMediaLineItemsChange={noop}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={[]}
          initialLineItems={initialLineItems}
        />,
      )
    })
    await settle()
    for (const n of expand) {
      const toggle = host.querySelector(`button[aria-label="Expand details for ooh line item ${n}"]`) as HTMLButtonElement
      expect(toggle, `expand ${n}`).toBeTruthy()
      act(() => toggle.click())
    }
    await settle(50)
  }

  const named = (label: string) => [...document.querySelectorAll<HTMLElement>(`[aria-label="${label}"]`)]
  const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!

  function gridOffsetHeight() {
    return vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "THEAD" ? 40 : 2000
    })
  }

  it("names every button, ties every card label to its control, and names each burst's deliverables", async () => {
    await mount([1, 2])
    const labelled = new Set([...host.querySelectorAll("label")].map((l) => l.htmlFor).filter(Boolean))
    for (const l of host.querySelectorAll("label")) {
      expect(l.htmlFor && document.getElementById(l.htmlFor), `label "${l.textContent?.trim()}" names a control`).toBeTruthy()
    }
    const nameless = [...host.querySelectorAll("button")].filter(
      (b) => !b.textContent?.trim() && !b.getAttribute("aria-label") && !labelled.has(b.id),
    )
    expect(nameless.map((b) => b.outerHTML.slice(0, 80)), "buttons with no name").toEqual([])
    const unnamedInputs = [...host.querySelectorAll<HTMLInputElement>("input:not([type=hidden]), textarea")].filter(
      (i) => !i.getAttribute("aria-label") && !labelled.has(i.id) && !i.closest("label"),
    )
    expect(unnamedInputs.map((i) => i.outerHTML.slice(0, 80)), "inputs with no name").toEqual([])
    expect(named("Panels, burst 2, line 1").length, "panels deliverables named").toBe(1)
    expect(named("Bonus Deliverables, burst 1, line 2").length, "bonus deliverables named").toBe(1)
  }, 30_000)

  it("shows Network and Format on the card summary, and groups spend by OOH's dimensions", async () => {
    await mount([])
    expect(host.textContent).toContain("Network: JCDecaux")
    // The card shows the saved format value, as the old container did.
    expect(host.textContent).toContain("Format: large_format")
    const summary = [...host.querySelectorAll("span")].filter((s) => /media ·/.test(s.textContent ?? ""))
    expect(summary.map((s) => s.textContent?.replace(/^.*· /, ""))).toEqual(["4 panels", "5 deliverables"])
    const groupBy = host.querySelector('[role="group"][aria-label="Group spend by"]')!
    expect([...groupBy.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Network", "Placement", "Format", "Buy Type"])
  }, 30_000)

  it("over 30 panel lines, opens the grid and leaves a named summary in place of the cards", async () => {
    const panels = Array.from({ length: 31 }, (_, i) =>
      line(i + 1, { attrs: { buy_granularity: "panel" }, bursts: [burst({ calculatedValue: 1 })] }),
    )
    const offsetHeight = gridOffsetHeight()
    await mount([], panels)
    expect(document.querySelector('[role="dialog"]'), "grid opens itself").toBeTruthy()
    act(() => button("Card entry").click())
    await settle(50)
    offsetHeight.mockRestore()
    expect(host.textContent).toContain("31 large-format panel lines")
    expect(named("Expand details for ooh line item 1").length, "no cards").toBe(0)
    expect(button("Open expert view"), "a named way back to the grid").toBeTruthy()
  }, 30_000)

  it("asks to leave OOH Expert Mode when the grid closes with an edit", async () => {
    await mount([])
    const offsetHeight = gridOffsetHeight()
    act(() => button("Schedule grid").click())
    await settle(100)
    const grid = document.querySelector('[role="dialog"]') as HTMLElement
    const cell = [...grid.querySelectorAll("input, textarea")].find((i) => (i as HTMLInputElement).value === "p1") as HTMLTextAreaElement
    expect(cell, "the placement cell").toBeTruthy()
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
    expect(titles).toContain("Leave OOH Expert Mode?")
  }, 30_000)
})
