/**
 * W5l items 3 and 5: Production on the shared channel container.
 *
 * Names: every control in an expanded card has an accessible name, every
 * icon-only button names the line or burst it acts on, and no input is
 * nameless (web.dev "Form elements have associated labels").
 *
 * Scale: a 60-line, 180-burst grid gives one billing burst and one Excel row
 * per burst, with the money and the line numbers worked out here from the
 * inputs, not from the container's own helpers.
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
  getPublishersForProduction: async () => [{ id: 1, publisher_name: "Soundhouse" }],
}))

const { default: ProductionContainer } = await import(
  "@/components/media-containers/ProductionContainer"
)

const settle = (ms = 400) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

/** The campaign window every line sits in. */
const START = new Date(2026, 0, 5)
const END = new Date(2026, 2, 31)

/** 60 lines of 3 bursts: distinct costs and quantities, so no total can hide a swap. */
const bigGrid = Array.from({ length: 60 }, (_, i) => ({
  line_item_id: `tst001PROD${i + 1}`,
  line_item: i + 1,
  media_type: i % 2 === 0 ? "Television" : "Radio",
  publisher: "Soundhouse",
  description: `edit ${i + 1}`,
  market: i % 3 === 0 ? "Melbourne" : "Sydney",
  buy_type: null,
  bursts: [1, 2, 3].map((b) => ({
    cost: 100 * (i + 1) + b,
    amount: b,
    startDate: "2026-01-05",
    endDate: "2026-01-31",
  })),
}))

/** The accessible name of a control, by the rules a screen reader applies here. */
function accessibleName(el: Element): string {
  const aria = el.getAttribute("aria-label")
  if (aria && aria.trim()) return aria.trim()
  const labelledBy = el.getAttribute("aria-labelledby")
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .join(" ")
      .trim()
    if (text) return text
  }
  const id = el.getAttribute("id")
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`)
    const text = label?.textContent?.trim()
    if (text) return text
  }
  const wrapping = el.closest("label")?.textContent?.trim()
  if (wrapping) return wrapping
  const title = el.getAttribute("title")
  if (title && title.trim()) return title.trim()
  return (el.textContent ?? "").trim()
}

function render(root: Root, lines: unknown[], calls: Array<[string, unknown]>) {
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
      />,
    )
  })
}

describe("Production on the shared channel container (W5l)", () => {
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

  it("names every control on an expanded card, and every icon button names its line", async () => {
    // Line 2's publisher is in no publisher list, so the card flags it.
    render(root, [bigGrid[0]!, { ...bigGrid[1]!, publisher: "SCA" }], [])
    await settle()
    const expand = (line: number) =>
      act(() =>
        (
          host.querySelector(
            `button[aria-label="Expand details for production line item ${line}"]`,
          ) as HTMLButtonElement
        ).click(),
      )
    expand(1)
    expand(2)
    await settle(100)

    // The card summary's four cells, Production's own (it has no buy types).
    const summary = host.textContent ?? ""
    for (const cell of ["Production type:", "Publisher:", "Market:", "Bursts:"]) {
      expect(summary, cell).toContain(cell)
    }
    expect(summary).not.toContain("Buy Type:")
    expect(summary.match(/Not in Publishers, pick one/g) ?? []).toHaveLength(1)

    // Add burst starts the new row at a cost and a quantity of zero, as the
    // old card did, not at a blank budget row.
    const addBurst = [...host.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Add burst to line 1",
    ) as HTMLButtonElement
    act(() => addBurst.click())
    await settle(100)
    // Line 1 loaded with three bursts, so the added one is the fourth.
    const costs = [...host.querySelectorAll('input[name="lineItems.0.bursts.3.cost"]')] as HTMLInputElement[]
    const quantities = [...host.querySelectorAll('input[name="lineItems.0.bursts.3.amount"]')] as HTMLInputElement[]
    expect(costs.map((i) => i.value), "the added burst's cost").toEqual(["$0.00"])
    expect(quantities.map((i) => i.value), "the added burst's quantity").toEqual(["0"])

    const nameless = [...host.querySelectorAll("input, select, textarea")].filter(
      (el) => el.getAttribute("type") !== "hidden" && !accessibleName(el),
    )
    expect(
      nameless.map((el) => el.getAttribute("name") || el.outerHTML.slice(0, 160)),
      "every input needs a name a screen reader can read",
    ).toEqual([])

    const buttons = [...host.querySelectorAll("button")]
    expect(buttons.filter((b) => !accessibleName(b)), "no nameless button").toEqual([])

    // The burst row's own buttons say which burst and which line they act on.
    const names = buttons.map(accessibleName)
    expect(names.filter((n) => /^Add burst to line 1$/.test(n)).length).toBeGreaterThan(0)
    expect(names.filter((n) => /^Duplicate burst on line 1$/.test(n)).length).toBeGreaterThan(0)
    expect(names.filter((n) => /^Remove burst 1 from line 1$/.test(n)).length).toBeGreaterThan(0)
    // Cost and Quantity are inputs, not buttons: they carry their own names.
    const inputNames = [...host.querySelectorAll("input")].map(accessibleName)
    expect(inputNames).toContain("Cost, burst 1, line 1")
    expect(inputNames).toContain("Quantity, burst 1, line 1")
    // The read-only burst total names its burst and line, like Cost and Quantity.
    expect(inputNames).toContain("Production Total, burst 1, line 1")
    expect(inputNames).toContain("Production Total, burst 4, line 1")
    // Its visible heading is tied to it: no label points at a missing control.
    const dangling = [...host.querySelectorAll("label[for]")]
      .filter((l) => !document.getElementById(l.getAttribute("for")!))
      .map((l) => `${l.getAttribute("for")}: ${l.textContent}`)
    expect(dangling, "every label points at a real control").toEqual([])
  }, 60_000)

  it("gives one billing burst and one Excel row per burst on a 60-line grid", async () => {
    const calls: Array<[string, unknown]> = []
    render(root, bigGrid, calls)
    await settle(1200)

    const last = (name: string) =>
      calls.filter(([n]) => n === name).map(([, v]) => v).at(-1)

    const billing = last("billing") as Array<Record<string, unknown>>
    const excel = last("excel") as Array<Record<string, unknown>>
    const save = last("save") as Array<Record<string, unknown>>
    const totals = last("total") as [number, number]

    const wanted = bigGrid.flatMap((line, i) =>
      line.bursts.map((burst) => ({
        lineNumber: i + 1,
        lineId: line.line_item_id,
        media: burst.cost * burst.amount,
        amount: burst.amount,
        cost: burst.cost,
        publisher: line.publisher,
        market: line.market,
        description: line.description,
      })),
    )

    expect(billing).toHaveLength(180)
    expect(excel).toHaveLength(180)
    expect(save).toHaveLength(60)

    expect(
      billing.map((b) => [b.mediaAmount, b.deliverables, b.feeAmount, b.mediaType, b.buyType]),
    ).toEqual(wanted.map((w) => [w.media, w.amount, 0, "production", "production"]))

    expect(
      excel.map((r) => [
        r.platform,
        r.buyType,
        r.grossMedia,
        r.deliverables,
        r.deliverablesAmount,
        r.network,
        r.market,
        r.creative,
        r.line_item,
        r.line_item_id,
      ]),
    ).toEqual(
      wanted.map((w) => [
        "production",
        "production",
        String(w.media),
        w.amount,
        String(w.cost),
        w.publisher,
        w.market,
        w.description,
        w.lineNumber,
        w.lineId,
      ]),
    )

    expect(save.map((r) => r.line_item_id)).toEqual(bigGrid.map((l) => l.line_item_id))
    expect(save.map((r) => (r.bursts as unknown[]).length)).toEqual(bigGrid.map(() => 3))
    const media = wanted.reduce((sum, w) => sum + w.media, 0)
    expect(totals).toEqual([media, 0])
  }, 120_000)
})
