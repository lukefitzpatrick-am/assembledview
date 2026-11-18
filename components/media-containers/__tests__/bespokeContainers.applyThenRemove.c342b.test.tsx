/**
 * C342B (C342fix review F5): Cinema, Radio, Television, Magazines and
 * Newspaper (and OOH, C342Bfix L3) number their summary's "Line N" and their
 * Excel rows' `line_item` from the card order, as the shared hook does. Apply stamps each
 * line's `position`; a Remove after it left the stamps stale, so the summary
 * read Line 2, Line 3 while the cards said 1 and 2. Screen and Excel number
 * only: save numbers lines by their place.
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
  getPublishersForOoh: async () => [{ id: 9, publisher_name: "JCDecaux" }],
  getPublishersForCinema: async () => [{ id: 1, publisher_name: "Hoyts" }],
  getPublishersForRadio: async () => [{ id: 2, publisher_name: "Nova" }],
  getRadioStations: async () => [],
  getPublishersForTelevision: async () => [{ id: 3, publisher_name: "Seven" }],
  getTVStations: async () => [],
  getPublishersForMagazines: async () => [{ id: 4, publisher_name: "Are Media" }],
  getMagazines: async () => [],
  getMagazinesAdSizes: async () => [],
  getPublishersForNewspapers: async () => [{ id: 5, publisher_name: "News Corp" }],
  getNewspapers: async () => [],
  getNewspapersAdSizes: async () => [],
}))

const { default: CinemaContainer } = await import("@/components/media-containers/CinemaContainer")
const { default: RadioContainer } = await import("@/components/media-containers/RadioContainer")
const { default: TelevisionContainer } = await import("@/components/media-containers/TelevisionContainer")
const { default: MagazinesContainer } = await import("@/components/media-containers/MagazinesContainer")
const { default: NewspaperContainer } = await import("@/components/media-containers/NewspaperContainer")
const { default: OohContainer } = await import("@/components/media-containers/OOHContainer")

const CHANNELS: Array<{
  name: string
  Container: ComponentType<any>
  code: string
  props: Record<string, unknown>
  network: string
  buyType: string
}> = [
  { name: "Cinema", Container: CinemaContainer, code: "CN", props: { feecinema: 0 }, network: "Hoyts", buyType: "spots" },
  { name: "Radio", Container: RadioContainer, code: "RA", props: { feeradio: 0 }, network: "Nova", buyType: "spots" },
  {
    name: "Television",
    Container: TelevisionContainer,
    code: "TV",
    props: { feetelevision: 0, onTelevisionLineItemsChange: () => {} },
    network: "Seven",
    buyType: "spots",
  },
  { name: "Magazines", Container: MagazinesContainer, code: "MG", props: { feemagazines: 0 }, network: "Are Media", buyType: "insertions" },
  {
    name: "Newspaper",
    Container: NewspaperContainer,
    code: "NP",
    props: { feenewspapers: 0, onNewspaperLineItemsChange: () => {} },
    network: "News Corp",
    buyType: "insertions",
  },
  { name: "OOH", Container: OohContainer, code: "OH", props: { feeooh: 0 }, network: "JCDecaux", buyType: "panels" },
]

const noop = () => {}

async function settle(ms = 400) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

const buttons = (text: string) =>
  [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === text) as HTMLButtonElement[]

describe.each(CHANNELS)("$name: Apply then Remove keeps line numbers in card order (F5)", (channel) => {
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
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
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

  it("numbers the summary and Excel rows 1 and 2 after Apply and a Remove", async () => {
    const { Container } = channel
    const line = (n: number) => ({
      line_item_id: `tst001${channel.code}${n}`,
      line_item: n,
      network: channel.network,
      publisher: channel.network,
      station: `Station ${n}`,
      title: `Title ${n}`,
      buy_type: channel.buyType,
      market: "National",
      bursts: [
        { budget: `$${n},000.00`, buyAmount: "$500.00", startDate: "2026-01-05", endDate: "2026-01-31", calculatedValue: n * 2 },
      ],
    })
    let excel: Array<{ line_item?: unknown; line_item_id?: unknown }> = []
    act(() => {
      root.render(
        <Container
          clientId="client-1"
          {...channel.props}
          onTotalMediaChange={noop}
          onBurstsChange={noop}
          onInvestmentChange={noop}
          onLineItemsChange={(rows: typeof excel) => {
            excel = rows
          }}
          onMediaLineItemsChange={noop}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={[]}
          initialLineItems={[line(1), line(2), line(3)]}
        />,
      )
    })
    await settle()

    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "THEAD" ? 40 : 2000
    })
    act(() => buttons("Schedule grid")[0]!.click())
    await settle(100)
    const apply = buttons("Apply to plan (not saved yet)")
    expect(apply.length).toBe(1)
    act(() => apply[0]!.click())
    await settle()

    const remove = buttons("Remove")
    expect(remove.length).toBe(3)
    act(() => remove[0]!.click())
    await settle()

    const labels = [...host.querySelectorAll("span")]
      .map((s) => s.textContent?.trim() ?? "")
      .filter((t) => /^Line \d+$/.test(t))
    expect(labels).toEqual(["Line 1", "Line 2"])
    const rows = [...new Map(excel.map((r) => [String(r.line_item_id), r.line_item])).entries()]
    expect(rows).toEqual([
      [`tst001${channel.code}2`, 1],
      [`tst001${channel.code}3`, 2],
    ])
  }, 30_000)
})
