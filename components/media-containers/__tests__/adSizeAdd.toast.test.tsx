/**
 * W5j review F6: Add Ad Size on Newspaper and Magazines. The toast reads
 * "Ad Size Added", the created size is set on the line (it reaches the save
 * rows), and the dialog closes. The form has no resolver and nothing reads
 * its dirty state, so the setValue flags have no visible effect to pin.
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { act, type ComponentType } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

const toasts = vi.hoisted(() => {
  const list: Array<{ title?: string }> = []
  // One stable toast function, as the real hook gives.
  const toast = (t: { title?: string }) => void list.push(t)
  return { list, api: { toast } }
})

vi.mock("@/components/ui/use-toast", () => ({ useToast: () => toasts.api, toast: toasts.api.toast }))

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForMagazines: async () => [{ id: 1, publisher_name: "Are Media" }],
  getMagazines: async () => [],
  getMagazinesAdSizes: async () => [{ id: 1, adsize: "Full Page" }],
  createMagazineAdSize: async (data: { adsize: string }) => ({ id: 2, ...data }),
  getPublishersForNewspapers: async () => [{ id: 1, publisher_name: "News Corp" }],
  getNewspapers: async () => [],
  getNewspapersAdSizes: async () => [{ id: 1, adsize: "Full Page" }],
  createNewspaperAdSize: async (data: { adsize: string }) => ({ id: 2, ...data }),
}))

const { default: MagazinesContainer } = await import("@/components/media-containers/MagazinesContainer")
const { default: NewspaperContainer } = await import("@/components/media-containers/NewspaperContainer")

const CHANNELS: Array<{ name: string; Container: ComponentType<any>; props: Record<string, unknown>; key: string; noun: string }> = [
  { name: "Magazines", Container: MagazinesContainer, props: { feemagazines: 0 }, key: "magazines", noun: "Magazine" },
  { name: "Newspaper", Container: NewspaperContainer, props: { feenewspapers: 0 }, key: "newspaper", noun: "Newspaper" },
]

const settle = (ms = 300) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))
const noop = () => {}

describe.each(CHANNELS)("$name: Add Ad Size", ({ Container, props, key, noun }) => {
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
    toasts.list.length = 0
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("toasts Ad Size Added, sets the size on the line and closes the dialog", async () => {
    const media: any[][] = []
    act(() => {
      root.render(
        <Container
          clientId="client-1"
          {...props}
          onTotalMediaChange={noop}
          onBurstsChange={noop}
          onInvestmentChange={noop}
          onLineItemsChange={noop}
          onMediaLineItemsChange={(rows: any[]) => media.push(rows)}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={[]}
          initialLineItems={[
            { line_item_id: "tst001X1", line_item: 1, network: "N", size: "Full Page", buy_type: "insertions", bursts: [{ budget: "$1,000.00", buyAmount: "$500.00", startDate: "2026-01-05", endDate: "2026-01-31" }] },
          ]}
        />,
      )
    })
    await settle()
    act(() => (host.querySelector(`button[aria-label="Expand details for ${key} line item 1"]`) as HTMLButtonElement).click())
    await settle(50)
    act(() => (document.querySelector('[aria-label="Add an ad size for line 1"]') as HTMLButtonElement).click())
    await settle(50)
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.querySelector("h2")?.textContent?.trim()).toBe(`Add New ${noun} Ad Size`)
    const input = dialog.querySelector("input") as HTMLInputElement
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "DPS")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    act(() => ([...dialog.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add Ad Size") as HTMLButtonElement).click())
    await settle()
    expect(toasts.list.map((t) => t.title)).toEqual(["Ad Size Added"])
    expect(media.at(-1)![0].size).toBe("DPS")
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(0)
  }, 30_000)
})
