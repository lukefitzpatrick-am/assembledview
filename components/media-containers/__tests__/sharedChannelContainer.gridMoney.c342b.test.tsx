/**
 * C342B (V66 B, C-342): the schedule grid, mounted, on a fee-inclusive line.
 * One cpm line, $12,000.00 for one week, CPM $15.00, client fee 12.5%, saved
 * deliverables 700,000 (the net $10,500.00 buys them).
 *
 * - The grid's cell holds the 700,000; its footer shows the card's money:
 *   net media $10,500.00, fees $1,500.00 (12.5% of gross), total $12,000.00.
 * - Apply with no edit gives the line back as saved.
 * - Typing 1,400,000 into the cell saves 1,400,000 and the $24,000.00 that
 *   buys them at the fee.
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { act, type ComponentType } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForSearch: async () => [{ id: 1, publisher_name: "Google" }],
  getPublishersForProgDisplay: async () => [{ id: 3, publisher_name: "DV360" }],
}))

const { default: SearchContainer } = await import(
  "@/components/media-containers/SearchContainer"
)
const { default: ProgDisplayContainer } = await import(
  "@/components/media-containers/ProgDisplayContainer"
)

const FEE = 12.5

const CHANNELS: { name: string; Component: ComponentType<any>; props: Record<string, unknown>; code: string }[] = [
  { name: "search", Component: SearchContainer, props: { feesearch: FEE }, code: "SE" },
  { name: "prog display", Component: ProgDisplayContainer, props: { feeprogdisplay: FEE }, code: "PD" },
]

const noop = () => {}

async function settle(ms = 400) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

const buttons = (name: string) =>
  [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === name) as HTMLButtonElement[]

/** A footer chip's figure, found by its label. */
function chip(label: string): string {
  const span = [...document.querySelectorAll("span")].find((s) => s.textContent?.trim() === label)
  expect(span, label).toBeTruthy()
  return span!.nextElementSibling?.textContent?.trim() ?? ""
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
  input.dispatchEvent(new FocusEvent("blur", { bubbles: true }))
}

describe.each(CHANNELS)("$name schedule grid on a fee-inclusive line (C342B)", (channel) => {
  let host: HTMLDivElement
  let root: Root
  let media: any[]

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
    media = []
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  async function openGrid() {
    const { Component } = channel
    act(() => {
      root.render(
        <Component
          clientId="client-1"
          {...channel.props}
          onTotalMediaChange={noop}
          onBurstsChange={noop}
          onInvestmentChange={noop}
          onLineItemsChange={noop}
          onMediaLineItemsChange={(items: any[]) => {
            media = items
          }}
          campaignStartDate={new Date(2026, 0, 4)}
          campaignEndDate={new Date(2026, 1, 28)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={[]}
          initialLineItems={[
            {
              line_item_id: `tst001${channel.code}1`,
              line_item: 1,
              platform: channel.code === "SE" ? "Google" : "DV360",
              buy_type: "cpm",
              budget_includes_fees: true,
              bursts: [
                { budget: "$12,000.00", buyAmount: "$15.00", calculatedValue: 700000, startDate: "2026-01-04", endDate: "2026-01-10" },
              ],
            },
          ]}
        />,
      )
    })
    await settle()
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "THEAD" ? 40 : 2000
    })
    act(() => buttons("Schedule grid")[0]!.click())
    await settle(100)
  }

  const cell = () =>
    [...document.querySelectorAll("input")].find((i) => (i as HTMLInputElement).value === "700000") as
      | HTMLInputElement
      | undefined

  it("shows the deliverables in the cell and the card's money in the footer", async () => {
    await openGrid()
    expect(cell(), "the week cell holds the saved deliverables").toBeTruthy()
    expect(chip("Net media")).toBe("$10,500.00")
    expect(chip(`Fees (${FEE}% of gross)`)).toBe("$1,500.00")
    expect(chip("Total w/ fees")).toBe("$12,000.00")
  }, 30_000)

  it("Apply with no edit gives the line back as saved", async () => {
    await openGrid()
    act(() => buttons("Apply to plan (not saved yet)")[0]!.click())
    await settle()
    expect(media[0].budget_includes_fees).toBe(true)
    expect(media[0].bursts).toHaveLength(1)
    expect(media[0].bursts[0]).toMatchObject({ budget: "12000", calculatedValue: 700000 })
  }, 30_000)

  it("a typed quantity saves those deliverables and the budget that buys them at the fee", async () => {
    await openGrid()
    act(() => setInput(cell()!, "1400000"))
    await settle(50)
    expect(chip("Total w/ fees")).toBe("$24,000.00")
    act(() => buttons("Apply to plan (not saved yet)")[0]!.click())
    await settle()
    expect(media[0].budget_includes_fees).toBe(true)
    expect(media[0].bursts[0]).toMatchObject({ budget: "24000", calculatedValue: 1400000 })
  }, 30_000)
})
