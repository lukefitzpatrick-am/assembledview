/**
 * W5lfix: Production behaviour the W5l review found unpinned.
 *
 * - F1: a grid Apply that would zero a priced line keeps the card's bursts,
 *   the shared floor every channel has (C-383).
 * - A first burst at cost 0 with no saved unit rate saves a blank unit rate,
 *   not 0 (25 live lines take this path).
 * - The grid's Production type cell offers the plan's production types.
 * - A new line starts with a burst at cost 0 and quantity 0.
 * - With no MBA number yet, save numbers lines from their ids, not from a
 *   stale `line_item` on the loaded row.
 * - Production's fee is 0 even if a caller slips a fee past the prop type.
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

const plan = vi.hoisted(() => ({ mbaNumber: "tst001" }))

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: plan.mbaNumber, setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForProduction: async () => [{ id: 1, publisher_name: "Soundhouse" }],
}))

const { default: ProductionContainer } = await import(
  "@/components/media-containers/ProductionContainer"
)

const settle = (ms = 400) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

const START = new Date(2026, 0, 5)
const END = new Date(2026, 2, 29)

type Calls = Array<[string, unknown]>

function line(n: number, extra: Record<string, unknown>) {
  return {
    line_item_id: `tst001PROD${n}`,
    line_item: n,
    media_type: "Television",
    publisher: "Soundhouse",
    description: `edit ${n}`,
    market: "Melbourne",
    buy_type: null,
    ...extra,
  }
}

function render(root: Root, lines: unknown[], calls: Calls, extraProps: object = {}) {
  const on = (name: string) => (...args: unknown[]) =>
    calls.push([name, args.length > 1 ? args : args[0]])
  act(() => {
    root.render(
      <ProductionContainer
        clientId="client-1"
        onTotalMediaChange={on("total")}
        onBurstsChange={on("billing")}
        onInvestmentChange={on("investment")}
        onLineItemsChange={on("excel")}
        onMediaLineItemsChange={on("save")}
        campaignStartDate={START}
        campaignEndDate={END}
        campaignBudget={0}
        campaignId=""
        mediaTypes={[
          { value: "Television", label: "Television" },
          { value: "Radio", label: "Radio" },
        ]}
        initialLineItems={lines}
        {...extraProps}
      />,
    )
  })
}

const last = (calls: Calls, name: string) =>
  calls.filter(([n]) => n === name).map(([, v]) => v).at(-1)

const buttonByText = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as
    | HTMLButtonElement
    | undefined

function setInput(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

async function openGrid() {
  const open = buttonByText("Schedule grid")
  expect(open, "the Schedule grid button").toBeTruthy()
  act(() => open!.click())
  await settle(150)
  const dialog = document.querySelector('[role="dialog"]') as HTMLElement
  expect(dialog, "the grid dialog").toBeTruthy()
  return dialog
}

describe("Production pins from the W5l review (W5lfix)", () => {
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
    plan.mbaNumber = "tst001"
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    resetWeekStartsOnStore()
    // The grid renders only the rows that fit its body's height.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
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

  it("keeps the card's bursts when a grid Apply would zero a priced line (F1)", async () => {
    const calls: Calls = []
    render(
      root,
      [line(1, { bursts: [{ cost: 1000, amount: 7, startDate: "2026-01-05", endDate: "2026-01-11" }] })],
      calls,
    )
    await settle()
    const dialog = await openGrid()

    // The week cells follow the Unit Rate cell and hold the line's 7 units;
    // zero every one of them.
    const inputs = [...dialog.querySelectorAll("input")] as HTMLInputElement[]
    const rate = inputs.findIndex((i) => i.value === "$1,000.00")
    expect(rate, "the Unit Rate cell").toBeGreaterThan(-1)
    const cells = inputs.slice(rate + 1).filter((i) => /^[1-7]$/.test(i.value))
    expect(cells.length, "week cells holding the quantity").toBeGreaterThan(0)
    expect(cells.reduce((sum, c) => sum + Number(c.value), 0)).toBe(7)
    for (const cell of cells) {
      act(() => setInput(cell, "0"))
      await settle(60)
    }
    await settle(100)

    const apply = buttonByText("Apply to plan (not saved yet)")
    expect(apply, "the Apply button").toBeTruthy()
    act(() => apply!.click())
    await settle()

    const save = last(calls, "save") as Array<{ bursts: Array<Record<string, unknown>> }>
    expect(
      save[0]!.bursts.map((b) => [b.cost, b.amount, b.startDate, b.endDate]),
      "the shared floor keeps the card's priced burst",
    ).toEqual([[1000, 7, "2026-01-05", "2026-01-11"]])
    expect(last(calls, "total")).toEqual([7000, 0])
  }, 60_000)

  it("saves a blank unit rate when the first burst costs 0 and none was saved", async () => {
    const calls: Calls = []
    render(
      root,
      [
        line(1, {
          bursts: [
            { cost: 0, amount: 1, startDate: "2026-01-05", endDate: "2026-01-11" },
            { cost: 500, amount: 2, startDate: "2026-01-12", endDate: "2026-01-18" },
          ],
        }),
        line(2, {
          bursts: [{ cost: 250, amount: 2, startDate: "2026-01-05", endDate: "2026-01-11" }],
        }),
      ],
      calls,
    )
    await settle()
    const save = last(calls, "save") as Array<Record<string, unknown>>
    expect(save.map((r) => r.unitRate)).toEqual(["", 250])
  }, 60_000)

  it("offers the plan's production types in the grid's Production type cell", async () => {
    render(root, [line(1, { bursts: [{ cost: 100, amount: 1 }] })], [])
    await settle()
    const dialog = await openGrid()
    const trigger = [...dialog.querySelectorAll('[role="combobox"]')].find(
      (el) => el.textContent?.trim() === "Television",
    ) as HTMLElement | undefined
    expect(trigger, "the row's Production type cell").toBeTruthy()
    act(() => trigger!.click())
    await settle(100)
    const options = [...document.querySelectorAll('[role="option"]')].map((o) =>
      o.textContent?.trim(),
    )
    expect(options.sort()).toEqual(["Radio", "Television"])
  }, 60_000)

  it("starts a new line with a burst at cost 0 and quantity 0", async () => {
    render(root, [line(1, { bursts: [{ cost: 100, amount: 1 }] })], [])
    await settle()
    // The new line opens expanded.
    act(() => buttonByText("Add Line Item")!.click())
    await settle(100)
    const value = (label: string) =>
      (host.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null)?.value
    expect(value("Cost, burst 1, line 2")).toBe("$0.00")
    expect(value("Quantity, burst 1, line 2")).toBe("0")
  }, 60_000)

  it("numbers lines from their ids, not a stale line number, before the MBA exists", async () => {
    plan.mbaNumber = ""
    const calls: Calls = []
    render(
      root,
      [
        { ...line(1, { bursts: [{ cost: 100, amount: 1 }] }), line_item_id: "abc", line_item: 3 },
        { ...line(2, { bursts: [{ cost: 200, amount: 1 }] }), line_item_id: "xyz", line_item: 1 },
      ],
      calls,
    )
    await settle()
    const save = last(calls, "save") as Array<Record<string, unknown>>
    expect(save.map((r) => [r.line_item, r.line_item_id])).toEqual([
      [1, "abc"],
      [2, "xyz"],
    ])
  }, 60_000)

  it("keeps Production's fee at 0 when a caller passes one past the type", async () => {
    const calls: Calls = []
    render(root, [line(1, { bursts: [{ cost: 100, amount: 3 }] })], calls, { feePct: 10 })
    await settle()
    expect(last(calls, "total")).toEqual([300, 0])
  }, 60_000)
})
