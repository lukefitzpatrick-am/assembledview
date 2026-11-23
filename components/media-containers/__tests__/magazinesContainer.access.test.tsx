/**
 * W5j: Magazines on the shared shell, what a planner and a screen reader
 * get. Every button has a name; Add Title and Add Ad Size name their line
 * (the old container's icon buttons had none); every card field label and
 * every Add dialog label names its control, and no input on an expanded
 * card is nameless. The Title list, on the card and in the grid, follows the
 * line's network and is disabled with none. The dialogs say "Magazine" (the
 * old ones said "Newspaper"). The card summary shows the line's Title, and
 * the summary names insertions "Insertions". Closing the grid with an edit
 * asks "Leave Magazines Media Expert Mode?", as the old container did.
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
  getPublishersForMagazines: async () => [
    { id: 1, publisher_name: "Are Media" },
    { id: 2, publisher_name: "Nine" },
  ],
  getMagazines: async () => [
    { id: 1, title: "Womens Weekly", network: "Are Media" },
    { id: 2, title: "Good Weekend", network: "Nine" },
  ],
  getMagazinesAdSizes: async () => [{ id: 1, adsize: "Full Page" }],
  createMagazineAdSize: async (data: { adsize: string }) => ({ id: 2, ...data }),
}))

const { default: MagazinesContainer } = await import("@/components/media-containers/MagazinesContainer")

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

const lines = [
  { line_item_id: "tst001MG1", line_item: 1, network: "Are Media", title: "Womens Weekly", size: "Full Page", buy_type: "insertions", placement: "p1", bursts: [burst(), burst()] },
  { line_item_id: "tst001MG2", line_item: 2, network: "", title: "", size: "", buy_type: "package", placement: "p2", bursts: [burst({ calculatedValue: 4 })] },
]

describe("Magazines on the shared shell: names, labels and catalogues (W5j)", () => {
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
    vi.restoreAllMocks()
  })

  async function mount(expand: number[], initialLineItems: unknown[] = lines) {
    act(() => {
      root.render(
        <MagazinesContainer
          clientId="client-1"
          feemagazines={10}
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
      const toggle = host.querySelector(`button[aria-label="Expand details for magazines line item ${n}"]`) as HTMLButtonElement
      expect(toggle, `expand ${n}`).toBeTruthy()
      act(() => toggle.click())
    }
    await settle(50)
  }

  const named = (label: string) => [...document.querySelectorAll<HTMLElement>(`[aria-label="${label}"]`)]
  const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!

  function labelsNameControls(scope: ParentNode) {
    const labels = [...scope.querySelectorAll("label")]
    for (const l of labels) {
      expect(l.htmlFor && document.getElementById(l.htmlFor), `label "${l.textContent?.trim()}" names a control`).toBeTruthy()
    }
    return labels
  }

  it("names every button and icon button by its line, and ties every card label to its control", async () => {
    await mount([1, 2])
    for (const n of [1, 2]) {
      expect(named(`Add a magazine title for line ${n}`).length, `title line ${n}`).toBe(1)
      expect(named(`Add an ad size for line ${n}`).length, `ad size line ${n}`).toBe(1)
    }
    const labelled = new Set([...host.querySelectorAll("label")].map((l) => l.htmlFor).filter(Boolean))
    const nameless = [...host.querySelectorAll("button")].filter(
      (b) => !b.textContent?.trim() && !b.getAttribute("aria-label") && !labelled.has(b.id),
    )
    expect(nameless.map((b) => b.outerHTML.slice(0, 80)), "buttons with no name").toEqual([])
    expect(labelsNameControls(host).length).toBe(20)
    const unnamedInputs = [...host.querySelectorAll<HTMLInputElement>("input:not([type=hidden]), textarea")].filter(
      (i) => !i.getAttribute("aria-label") && !labelled.has(i.id) && !i.closest("label"),
    )
    expect(unnamedInputs.map((i) => i.outerHTML.slice(0, 80)), "inputs with no name").toEqual([])
    expect(named("Insertions, burst 2, line 1").length, "burst deliverables named like Budget").toBe(1)
  }, 30_000)

  it("names a bonus line's burst deliverables input by its burst and line (W5j)", async () => {
    await mount([2], [lines[0], { ...lines[0], line_item_id: "tst001MG2", line_item: 2, buy_type: "bonus", bursts: [burst({ calculatedValue: 5 })] }])
    expect(named("Bonus Deliverables, burst 1, line 2").length).toBe(1)
  }, 30_000)

  it("lists titles by the line's network, disables Title with no network, and shows Title and Insertions in the summaries", async () => {
    await mount([1, 2])
    const title = (nth: number) =>
      [...host.querySelectorAll("label")].filter((l) => l.textContent?.trim() === "Title")[nth].parentElement!.querySelector('[role="combobox"]') as HTMLButtonElement
    expect(title(1).disabled, "no network: Title disabled").toBe(true)
    expect(title(1).textContent).toContain("Select Network first")
    act(() => title(0).click())
    await settle(50)
    expect([...document.querySelectorAll("[cmdk-item]")].map((o) => o.textContent?.trim())).toEqual(["Womens Weekly"])

    expect(host.textContent).toContain("Title: Womens Weekly")
    const summary = [...host.querySelectorAll("span")].filter((s) => /media ·/.test(s.textContent ?? ""))
    expect(summary.map((s) => s.textContent?.replace(/^.*· /, ""))).toEqual(["4 insertions", "4 package"])
    const groupBy = host.querySelector('[role="group"][aria-label="Group spend by"]')!
    expect([...groupBy.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Network", "Title", "Buy Type"])
  }, 30_000)

  it("labels the Add Title and Add Ad Size dialogs' fields", async () => {
    await mount([1])
    act(() => named("Add a magazine title for line 1")[0].click())
    await settle(50)
    const titleDialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(titleDialog.textContent).toContain("Add New Magazine Title")
    expect(labelsNameControls(titleDialog).map((l) => l.textContent?.trim())).toEqual(["Network", "Title name"])
    act(() => button("Cancel").click())
    await settle(50)

    act(() => named("Add an ad size for line 1")[0].click())
    await settle(50)
    const sizeDialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(sizeDialog.textContent).toContain("Add New Magazine Ad Size")
    expect(labelsNameControls(sizeDialog).map((l) => l.textContent?.trim())).toEqual(["Ad Size"])
    act(() => button("Add Ad Size").click())
    await settle(50)
    expect(sizeDialog.textContent, "a blank ad size is refused on the field").toContain("Ad Size is required")
    const sizeInput = [...sizeDialog.querySelectorAll("input")][0] as HTMLInputElement
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(sizeInput, "DPS")
      sizeInput.dispatchEvent(new Event("input", { bubbles: true }))
    })
    act(() => button("Add Ad Size").click())
    await settle(100)
    // The old container closed the Title dialog here and left this one open.
    expect([...document.querySelectorAll('[role="dialog"] h2')].map((h) => h.textContent?.trim()), "Add Ad Size closes its dialog").toEqual([])
  }, 30_000)

  it("lists the grid's titles by the row's network, and its ad sizes", async () => {
    await mount([])
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.tagName === "THEAD" ? 40 : 2000
      })
    act(() => button("Schedule grid").click())
    await settle(100)
    const grid = document.querySelector('[role="dialog"]') as HTMLElement
    const options = async (text: string) => {
      const cell = [...grid.querySelectorAll<HTMLButtonElement>('button[role="combobox"]')].find((b) => b.textContent?.trim() === text)!
      expect(cell, `the ${text} cell`).toBeTruthy()
      act(() => cell.click())
      await settle(50)
      const list = [...document.querySelectorAll("[cmdk-item]")].map((o) => o.textContent?.trim())
      act(() => cell.click())
      await settle(50)
      return list
    }
    expect(await options("Womens Weekly")).toEqual(["Womens Weekly"])
    expect(await options("Full Page")).toEqual(["Full Page"])
    offsetHeight.mockRestore()
  }, 30_000)

  it("asks to leave Magazines Media Expert Mode when the grid closes with an edit", async () => {
    await mount([])
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.tagName === "THEAD" ? 40 : 2000
      })
    act(() => button("Schedule grid").click())
    await settle(100)
    const grid = document.querySelector('[role="dialog"]') as HTMLElement
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
    expect(titles).toContain("Leave Magazines Media Expert Mode?")
  }, 30_000)
})
