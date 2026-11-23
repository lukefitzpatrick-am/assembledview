/**
 * S7: the Tracking control on a line card, through the shared channel
 * container (both editors mount it). Switch `line_tracking_type`.
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { setClientFeatureSnapshot } from "@/lib/features/client"
import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForProgDisplay: async () => [{ id: 3, publisher_name: "DV360" }],
}))

const { default: ProgDisplayContainer } = await import("@/components/media-containers/ProgDisplayContainer")

const apiLine = (n: number, extra: Record<string, unknown>) => ({
  line_item_id: `tst001PD${n}`,
  line_item: n,
  platform: "DV360",
  buy_type: "cpm",
  fixed_cost_media: false,
  client_pays_for_media: false,
  budget_includes_fees: false,
  no_adserving: false,
  bursts: [{ budget: "$1,000.00", buyAmount: "$10.00", startDate: "2026-01-12", endDate: "2026-02-15" }],
  ...extra,
})

const LINES = [
  apiLine(1, { tracking_type: "supplier_reported" }),
  apiLine(2, {}),
  apiLine(3, { platform: "News Corp", no_adserving: true }),
]

async function settle(ms = 450) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

function select(line: number): HTMLSelectElement | null {
  return document.querySelector(`select[aria-label="Tracking type for prog display line item ${line}"]`)
}

function choose(el: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!
  act(() => {
    setter.call(el, value)
    el.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

describe("Tracking control (S7)", () => {
  let host: HTMLDivElement
  let root: Root
  let media: any[] | null

  async function mount() {
    act(() => {
      root.render(
        <ProgDisplayContainer
          clientId="client-1"
          feeprogdisplay={10}
          onTotalMediaChange={() => {}}
          onBurstsChange={() => {}}
          onInvestmentChange={() => {}}
          onLineItemsChange={() => {}}
          onMediaLineItemsChange={(items: any[]) => {
            media = items
          }}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={100000}
          campaignId=""
          mediaTypes={["progDisplay"]}
          initialLineItems={LINES}
        />,
      )
    })
    await settle()
  }

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
    media = null
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    setClientFeatureSnapshot(null)
  })

  it("off: no control, and a saved choice still round-trips", async () => {
    setClientFeatureSnapshot({ line_tracking_type: false })
    await mount()
    expect(select(1)).toBeNull()
    expect(media?.[0].tracking_type).toBe("supplier_reported")
    expect("tracking_type" in media![1]).toBe(false)
  })

  it("on: a labelled control per line, on the saved choice or the line's default", async () => {
    setClientFeatureSnapshot({ line_tracking_type: true })
    await mount()
    const first = select(1)!
    expect(first.value).toBe("supplier_reported")
    expect((document.querySelector(`label[for="${first.id}"]`) as HTMLLabelElement).textContent).toBe("Tracking")
    expect(select(2)!.value).toBe("tracked")
    expect(select(2)!.selectedOptions[0]!.textContent).toBe("Tracked (default)")
    // No Ad Serving and no delivery source: assumed is this line's default.
    expect(select(3)!.value).toBe("assumed")
    expect(select(3)!.selectedOptions[0]!.textContent).toBe("Assumed (default)")
    expect([...first.options].map((o) => o.value)).toEqual(["tracked", "supplier_reported", "assumed", "not_tracked"])
  })

  it("on with in-app help: each line's help button has its own name", async () => {
    setClientFeatureSnapshot({ line_tracking_type: true, in_app_help: true })
    await mount()
    const names = [...document.querySelectorAll('button[aria-label^="Help: Tracking type"]')].map((b) => b.getAttribute("aria-label"))
    expect(names).toEqual([1, 2, 3].map((n) => `Help: Tracking type for prog display line item ${n}`))
  })

  it("on: a pick is saved; picking the default saves nothing", async () => {
    setClientFeatureSnapshot({ line_tracking_type: true })
    await mount()
    choose(select(2)!, "not_tracked")
    await settle()
    expect(media?.[1].tracking_type).toBe("not_tracked")
    expect(select(2)!.value).toBe("not_tracked")

    choose(select(1)!, "tracked")
    await settle()
    expect("tracking_type" in media![0]).toBe(false)
    expect(select(1)!.value).toBe("tracked")
  })
})
