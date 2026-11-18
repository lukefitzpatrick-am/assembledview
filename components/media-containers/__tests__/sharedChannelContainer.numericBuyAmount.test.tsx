/**
 * W5b (C-334): a saved burst can carry a numeric `buyAmount` (and budget).
 * Hydrate keeps the number, and the shared hook's `handleValueChange` used to
 * call `.replace` on it, which throws. Ticking Budget Includes Fees (or typing
 * a budget) on such a burst then stopped the deliverable recompute.
 *
 * The number must be read as its value: the save payload carries the
 * recomputed deliverable and nothing throws. Search, Social and Prog Display
 * all run the same hook code.
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { act, type ComponentType } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { computeDeliverableFromMedia } from "@/lib/mediaplan/deliverableBudget"
import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForSearch: async () => [{ id: 1, publisher_name: "Google" }],
  getPublishersForSocialMedia: async () => [{ id: 2, publisher_name: "Meta" }],
  getPublishersForProgDisplay: async () => [{ id: 3, publisher_name: "DV360" }],
}))

const { default: SearchContainer } = await import(
  "@/components/media-containers/SearchContainer"
)
const { default: SocialMediaContainer } = await import(
  "@/components/media-containers/SocialMediaContainer"
)
const { default: ProgDisplayContainer } = await import(
  "@/components/media-containers/ProgDisplayContainer"
)

const FEE = 10

type Channel = {
  name: string
  Component: ComponentType<any>
  props: Record<string, unknown>
  code: string
}

const CHANNELS: Channel[] = [
  { name: "search", Component: SearchContainer, props: { feesearch: FEE }, code: "SE" },
  {
    name: "social media",
    Component: SocialMediaContainer,
    props: { feesocial: FEE, onSocialMediaLineItemsChange: () => {} },
    code: "SM",
  },
  {
    name: "prog display",
    Component: ProgDisplayContainer,
    props: { feeprogdisplay: FEE },
    code: "PD",
  },
]

const noop = () => {}

async function settle(ms = 400) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

describe.each(CHANNELS)("$name numeric buyAmount (W5b, C-334)", (channel) => {
  let host: HTMLDivElement
  let root: Root
  let errors: unknown[]
  const onError = (e: ErrorEvent) => {
    errors.push(e.error ?? e.message)
    e.preventDefault()
  }

  beforeAll(() => {
    if (!("ResizeObserver" in globalThis)) {
      ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    }
  })

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    resetWeekStartsOnStore()
    errors = []
    window.addEventListener("error", onError)
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    window.removeEventListener("error", onError)
  })

  it("reads a numeric buyAmount as its value when fee-inclusive is ticked", async () => {
    const { Component } = channel
    let media: any[] = []
    const line = {
      line_item_id: `tst001${channel.code}1`,
      line_item: 1,
      platform: "Google",
      buy_type: "cpc",
      budget_includes_fees: false,
      bursts: [{ budget: 2500, buyAmount: 10, startDate: "2026-01-05", endDate: "2026-01-31" }],
    }
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
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={[]}
          initialLineItems={[line]}
        />,
      )
    })
    await settle()
    expect(media[0].bursts[0].calculatedValue).toBe(250)

    // The card is collapsed after hydrate, so only the hook recomputes.
    const label = [...host.querySelectorAll("label")].find(
      (l) => l.textContent?.trim() === "Budget Includes Fees",
    ) as HTMLElement
    const checkbox = label.parentElement!.querySelector('[role="checkbox"]') as HTMLElement
    expect(checkbox).toBeTruthy()
    act(() => checkbox.click())
    await settle()

    expect(errors).toEqual([])
    const expected = computeDeliverableFromMedia({
      buyType: "cpc",
      rawBudget: 2500,
      buyAmount: 10,
      budgetIncludesFees: true,
      feePct: FEE,
    })
    expect(expected).toBe(225)
    expect(media[0].budget_includes_fees).toBe(true)
    expect(media[0].bursts[0].calculatedValue).toBe(expected)
    expect(media[0].bursts[0].buyAmount).toBe(10)
  }, 30_000)
})
