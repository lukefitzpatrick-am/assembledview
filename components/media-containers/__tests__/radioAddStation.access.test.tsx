/**
 * W5g: Radio on the shared shell. Add Station is reachable by keyboard and
 * screen reader: each card's button names its line ("Add a radio station for
 * line 2"); the dialog has one "Network" label tied to its combobox and a
 * labelled station name; a network picked in the dialog is the one the
 * station is created under and the line saves; the toast says "Station
 * Added" (the station is stored in the catalogue); focus goes back to the
 * button. Each card field label names its control; the Station label names
 * its combobox, which lists the
 * catalogue's stations for the line's network (reloaded after an add, and
 * disabled with no network); the schedule grid gets the catalogue too, and
 * the channel fee both ways on a fee-inclusive line, and on open for a
 * fee-inclusive package line with a blank count (W5g review F1). The summary labels spots and package lines "spots" and
 * "package" (V90 A).
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

const db = vi.hoisted(() => {
  const toasts: Array<{ title?: unknown }> = []
  return {
    stations: [] as Array<{ id: number; station: string; network: string }>,
    created: [] as unknown[],
    toasts,
    toast: (t: { title?: unknown }) => {
      toasts.push(t)
    },
  }
})

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: db.toast }) }))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForRadio: async () => [
    { id: 1, publisher_name: "Nova" },
    { id: 2, publisher_name: "ARN" },
  ],
  getRadioStations: async () => db.stations.map((s) => ({ ...s })),
  createRadioStation: async (data: { station: string; network: string }) => {
    db.created.push(data)
    const row = { id: 100 + db.stations.length, ...data }
    db.stations.push(row)
    return { ...row }
  },
}))

const { default: RadioContainer } = await import("@/components/media-containers/RadioContainer")
const { RADIO_CONTAINER_CONFIG } = await import("@/lib/mediaplan/containerChannelConfig")

const noop = () => {}

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

const labels = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll("label")].filter((l) => l.textContent?.trim() === text) as HTMLLabelElement[]

const optionTexts = () => [...document.querySelectorAll("[cmdk-item]")].map((o) => o.textContent?.trim() ?? "")

function pick(text: string) {
  const option = [...document.querySelectorAll("[cmdk-item]")].find((o) => o.textContent?.trim() === text) as
    | HTMLElement
    | undefined
  expect(option, `option ${text}`).toBeTruthy()
  act(() => option!.click())
}

function line(n: number, extra: Record<string, unknown>) {
  return {
    line_item_id: `tst001RA${n}`,
    line_item: n,
    network: "Nova",
    station: "Nova 100",
    buy_type: "spots",
    bursts: [{ budget: "$1,000.00", buyAmount: "$100.00", startDate: "2026-01-05", endDate: "2026-01-31" }],
    ...extra,
  }
}

const lines = [
  line(1, {}),
  line(2, { network: "ARN", station: "KIIS" }),
  line(3, { network: null, station: null }),
  line(4, {
    buy_type: "package",
    bursts: [{ budget: "$12,000.00", buyAmount: "$1,000.00", calculatedValue: 8, startDate: "2026-01-05", endDate: "2026-01-31" }],
  }),
]

describe("Radio on the shared shell: Add Station, stations and summary labels (W5g)", () => {
  let host: HTMLDivElement
  let root: Root
  let media: any[][]

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
    db.stations = [
      { id: 1, station: "Nova 100", network: "Nova" },
      { id: 2, station: "smoothfm", network: "Nova" },
      { id: 3, station: "KIIS", network: "ARN" },
    ]
    db.created = []
    db.toasts.length = 0
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

  async function mount(expand: number[], items: unknown[] = lines, fee = 0) {
    act(() => {
      root.render(
        <RadioContainer
          clientId="client-1"
          feeradio={fee}
          onTotalMediaChange={noop}
          onBurstsChange={noop}
          onInvestmentChange={noop}
          onLineItemsChange={noop}
          onMediaLineItemsChange={(items: any[]) => media.push(items)}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={[]}
          initialLineItems={items as any[]}
        />,
      )
    })
    await settle()
    for (const n of expand) {
      const toggle = host.querySelector(`button[aria-label="Expand details for radio line item ${n}"]`) as HTMLButtonElement
      expect(toggle, `expand ${n}`).toBeTruthy()
      act(() => toggle.click())
    }
  }

  const addButton = (n: number) =>
    [...document.querySelectorAll(`button[aria-label="Add a radio station for line ${n}"]`)] as HTMLButtonElement[]
  const dialogFor = () =>
    [...document.querySelectorAll('[role="dialog"]')].find((d) => d.textContent?.includes("Add New Radio Station")) as
      | HTMLElement
      | undefined

  it("names each line's button, creates the station under the network picked, writes the line and gives focus back", async () => {
    await mount([1, 2, 3])
    for (const n of [1, 2, 3]) expect(addButton(n).length, `line ${n} button`).toBe(1)
    expect(document.querySelectorAll('button[aria-label^="Add a radio station"]').length).toBe(3)

    act(() => addButton(3)[0].click())
    await settle(50)
    expect(dialogFor(), "no dialog without a network").toBeUndefined()
    const stationControl = (i: number) => document.getElementById(labels(host, "Station")[i].htmlFor) as HTMLButtonElement
    expect(stationControl(2).disabled, "no station pick without a network").toBe(true)

    const [button] = addButton(1)
    act(() => {
      button.focus()
      button.click()
    })
    await settle(50)
    const d = dialogFor()
    expect(d, "dialog").toBeTruthy()
    const network = labels(d!, "Network")
    expect(network.length, "one Network label").toBe(1)
    const networkControl = document.getElementById(network[0].htmlFor)
    expect(networkControl?.getAttribute("role"), "Network names the combobox").toBe("combobox")
    expect(networkControl?.textContent).toContain("Nova")
    const name = document.getElementById(labels(d!, "Station name")[0].htmlFor) as HTMLInputElement
    expect(name?.tagName, "labelled station name").toBe("INPUT")

    act(() => networkControl!.click())
    await settle(50)
    pick("ARN")
    await settle(50)
    act(() => setInput(name, "Gold 104"))
    act(() => name.form!.requestSubmit())
    await settle()
    expect(dialogFor(), "closes after adding").toBeUndefined()
    expect(db.created).toEqual([{ station: "Gold 104", network: "ARN" }])
    expect(media[media.length - 1].map((l) => [l.network, l.station])).toEqual([
      ["ARN", "Gold 104"],
      ["ARN", "KIIS"],
      ["", ""],
      ["Nova", "Nova 100"],
    ])
    expect(db.toasts.map((t) => t.title)).toContain("Station Added")
    await settle(50)
    expect(document.activeElement, "focus back on Add Station").toBe(button)
    // The list is reloaded after the add, so line 2 (also ARN) is offered the new station.
    act(() => stationControl(1).click())
    await settle(50)
    expect(optionTexts()).toEqual(["Gold 104", "KIIS"])
  }, 30_000)

  it("ties each Station label to its combobox, lists the line's network's stations, and gives the grid the catalogue", async () => {
    await mount([1, 2])
    const stationLabels = labels(host, "Station")
    expect(stationLabels.length).toBe(2)
    const controls = stationLabels.map((l) => document.getElementById(l.htmlFor))
    for (const c of controls) expect(c?.getAttribute("role"), "Station names its combobox").toBe("combobox")
    // Every card field label names a control (the highlight wrapper used to take the id).
    const cardLabels = [...host.querySelectorAll("label")]
    expect(cardLabels.length).toBeGreaterThan(20)
    for (const l of cardLabels) {
      expect(l.htmlFor && document.getElementById(l.htmlFor), `label "${l.textContent?.trim()}" names a control`).toBeTruthy()
    }

    act(() => controls[0]!.click())
    await settle(50)
    expect(optionTexts()).toEqual(["Nova 100", "smoothfm"])
    pick("smoothfm")
    await settle()
    act(() => controls[1]!.click())
    await settle(50)
    expect(optionTexts()).toEqual(["KIIS"])
    pick("KIIS")
    await settle()
    expect(media[media.length - 1][0].station).toBe("smoothfm")

    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.tagName === "THEAD" ? 40 : 2000
      })
    const grid = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Schedule grid")!
    act(() => grid.click())
    await settle(100)
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    const stationCell = [...dialog.querySelectorAll('[role="combobox"]')].find(
      (c) => c.textContent?.trim() === "smoothfm",
    ) as HTMLElement | undefined
    expect(stationCell, "grid station cell").toBeTruthy()
    act(() => stationCell!.click())
    await settle(50)
    expect(optionTexts()).toEqual(expect.arrayContaining(["Nova 100", "smoothfm", "KIIS"]))
    offsetHeight.mockRestore()
  }, 30_000)

  it("labels spots and package lines in the summary (V90 A)", async () => {
    await mount([])
    const summary = [...host.querySelectorAll("span")].filter((s) => /media ·/.test(s.textContent ?? ""))
    expect(summary.map((s) => s.textContent?.replace(/^.*· /, ""))).toEqual([
      "10 spots",
      "10 spots",
      "10 spots",
      "8 package",
    ])
  }, 30_000)

  it("gives the schedule grid the channel fee both ways on a fee-inclusive line", async () => {
    // $8,000 gross at 12.5% is $7,000 net: 70 spots at $100, and 50 spots back
    // is $5,000 net, $5,714.29 gross.
    const feeLines = [
      line(1, {
        budget_includes_fees: true,
        bursts: [{ budget: "$8,000.00", buyAmount: "$100.00", startDate: "2026-01-05", endDate: "2026-01-11" }],
      }),
    ]
    await mount([], feeLines, 12.5)
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.tagName === "THEAD" ? 40 : 2000
      })
    const grid = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Schedule grid")!
    act(() => grid.click())
    await settle(100)
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    const week = [...dialog.querySelectorAll("input")].find((i) => i.value === "70")
    expect(week, "70 spots, net of the fee").toBeTruthy()
    act(() => setInput(week!, "50"))
    await settle(50)
    const apply = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Apply to plan (not saved yet)",
    ) as HTMLButtonElement
    act(() => apply.click())
    offsetHeight.mockRestore()
    await settle()
    const [b] = media[media.length - 1][0].bursts
    expect([b.budget, b.calculatedValue]).toEqual(["5714.29", 50])
  }, 30_000)

  it("hands the grid the channel fee on open, for a fee-inclusive package line with a blank count (W5g review F1)", async () => {
    // The mapper reads the fee only for a burst with no saved count. A package
    // count is never worked out from money (it comes back 0 and the card's
    // lump sum fills week 1), so the fee itself is what is pinned.
    const toExpert = vi.spyOn(RADIO_CONTAINER_CONFIG, "toExpert")
    const feeLines = [
      line(1, {
        buy_type: "package",
        budget_includes_fees: true,
        bursts: [{ budget: "$8,000.00", buyAmount: "$1,000.00", calculatedValue: "", startDate: "2026-01-05", endDate: "2026-01-11" }],
      }),
    ]
    await mount([], feeLines, 12.5)
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.tagName === "THEAD" ? 40 : 2000
      })
    act(() => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Schedule grid")!.click())
    await settle(100)
    offsetHeight.mockRestore()
    expect(toExpert).toHaveBeenCalledTimes(1)
    const [lines, , , , options] = toExpert.mock.calls[0]
    expect(lines[0].buyType).toBe("package")
    expect(lines[0].budgetIncludesFees).toBe(true)
    expect(options).toEqual({ feePct: 12.5 })
  }, 30_000)
})
