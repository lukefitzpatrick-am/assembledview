/**
 * W5afix F2: the shared container's summary sums bonus quantities as numbers.
 *
 * The bonus input writes a string into `calculatedValue`. The summary used to
 * add it with `+`, so bursts of 100 and 200 with 500 typed in the first read
 * "0500200 deliverables". A cleared input counts as 0, not NaN (W5c F4).
 * Display only: the save path is pinned by the goldens.
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
  getPublishersForSocialMedia: async () => [{ id: 2, publisher_name: "Meta" }],
}))

const { default: SearchContainer } = await import(
  "@/components/media-containers/SearchContainer"
)
const { default: SocialMediaContainer } = await import(
  "@/components/media-containers/SocialMediaContainer"
)

type Channel = {
  name: string
  Component: ComponentType<any>
  props: Record<string, unknown>
  code: string
}

const CHANNELS: Channel[] = [
  { name: "search", Component: SearchContainer, props: { feesearch: 10 }, code: "SE" },
  {
    name: "social media",
    Component: SocialMediaContainer,
    props: { feesocial: 10, onSocialMediaLineItemsChange: () => {} },
    code: "SM",
  },
]

const noop = () => {}

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

async function settle(ms = 400) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

describe.each(CHANNELS)("$name summary bonus deliverables (W5afix F2)", (channel) => {
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

  it("adds a typed bonus quantity as a number", async () => {
    const { Component } = channel
    const bonusLine = {
      line_item_id: `tst001${channel.code}1`,
      line_item: 1,
      platform: "Google",
      buy_type: "bonus",
      bursts: [
        { budget: "0", buyAmount: "0", startDate: "2026-01-05", endDate: "2026-01-31", calculatedValue: 100 },
        { budget: "0", buyAmount: "0", startDate: "2026-02-01", endDate: "2026-02-28", calculatedValue: 200 },
      ],
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
          onMediaLineItemsChange={noop}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={[]}
          initialLineItems={[bonusLine]}
        />,
      )
    })
    await settle()
    expect(host.textContent).toContain("300 deliverables")

    const toggle = host.querySelector(
      'button[aria-label^="Expand details for "][aria-label$=" line item 1"]',
    ) as HTMLButtonElement
    expect(toggle).toBeTruthy()
    act(() => toggle.click())
    const bonusInputs = [...host.querySelectorAll('input[type="number"]')] as HTMLInputElement[]
    expect(bonusInputs.length).toBe(2)
    act(() => setInput(bonusInputs[0], "500"))
    await settle()

    expect(host.textContent).toContain("700 deliverables")
    expect(host.textContent).not.toContain("0500200")

    // W5c F4: a cleared bonus input writes "" and counts as 0, never NaN.
    act(() => setInput(bonusInputs[0], ""))
    await settle()
    expect(host.textContent).toContain("200 deliverables")
    expect(host.textContent).not.toContain("NaN")
  }, 30_000)
})
