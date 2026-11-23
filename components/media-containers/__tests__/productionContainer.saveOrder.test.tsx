/**
 * W5l item 2 (the C-377 lesson): the Production container hands a page its
 * save rows only. One handler is wired to every callback the plan pages pass;
 * through hydrate, a card edit and an expert Apply, every array that reaches
 * the save callback is save rows, and the last write after the edit carries
 * the edited cost and quantity. The wrapper takes no raw-lines callback, so no
 * page can wire raw form lines to its save state.
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

const lines = [
  {
    line_item_id: "tst001PROD1",
    line_item: 1,
    media_type: "Television",
    publisher: "Soundhouse",
    description: "tvc edit",
    market: "Melbourne",
    buy_type: null,
    attrs: { unitRate: 500 },
    bursts: [{ cost: 500, amount: 2, startDate: "2026-01-05", endDate: "2026-01-31" }],
  },
  // A second line whose publisher is not in the publishers list: the card
  // flags it and the value still saves unchanged.
  {
    line_item_id: "tst001PROD2",
    line_item: 2,
    media_type: "Radio",
    publisher: "SCA",
    description: "radio tag",
    market: "Sydney",
    buy_type: null,
    bursts: [{ cost: 120, amount: 4, startDate: "2026-02-02", endDate: "2026-02-15" }],
  },
]

describe("Production hands a page its save rows only (W5l, C-377 lesson)", () => {
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
        <ProductionContainer
          clientId="client-1"
          onTotalMediaChange={on("total")}
          onBurstsChange={on("billing")}
          onInvestmentChange={on("investment")}
          onLineItemsChange={on("excel")}
          onMediaLineItemsChange={on("save")}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
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
    await settle()
    act(() =>
      (
        host.querySelector(
          'button[aria-label="Expand details for production line item 1"]',
        ) as HTMLButtonElement
      ).click(),
    )
    await settle(50)
    const type = (selector: string, value: string) => {
      const input = host.querySelector(selector) as HTMLInputElement
      expect(input, selector).toBeTruthy()
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })
      act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
    }
    type('input[name$=".0.bursts.0.cost"]', "750")
    type('input[name$=".0.bursts.0.amount"]', "3")
    await settle()

    const saves = calls.filter(([name]) => name === "save").map(([, rows]) => rows as Array<Record<string, unknown>>)
    expect(saves.length).toBeGreaterThan(1)
    for (const rows of saves) {
      for (const row of rows) {
        expect(row).toMatchObject({ media_plan_version: 0, mba_number: "tst001" })
        expect(String(row.line_item_id)).toMatch(/^tst001PROD\d+$/)
      }
    }
    const last = saves.at(-1)!
    expect(last[0]).toMatchObject({ media_type: "Television", publisher: "Soundhouse", description: "tvc edit" })
    expect(last[0].bursts).toMatchObject([{ cost: 750, amount: 3, budget: "2250", calculatedValue: 3 }])
    // The unknown publisher is flagged on the card and saved unchanged.
    expect(last[1]).toMatchObject({ publisher: "SCA" })
    expect(calls.map(([name]) => name)).not.toContain("raw")

    const totals = calls.filter(([name]) => name === "total").map(([, v]) => v as [number, number])
    // Cost x quantity is the only media, and Production carries no fee.
    expect(totals.at(-1)).toEqual([750 * 3 + 120 * 4, 0])
  }, 30_000)
})
