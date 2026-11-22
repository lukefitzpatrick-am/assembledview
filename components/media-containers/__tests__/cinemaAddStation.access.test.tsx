/**
 * W5f (C-341): Cinema's Add Station on the shared shell is reachable by
 * keyboard and screen reader. Each card's button names its line ("Add a
 * cinema station for line 2"); the dialog is labelled and takes focus; it has
 * one "Network" label, tied to the network combobox, and a labelled station
 * name in a form whose submit writes the network and the station to the line;
 * a blank name shows on the field; Escape and Cancel close it and focus goes
 * back to the button; a line with no network gets a prompt, not the dialog.
 * Nothing is stored or listed (station stub option A), so the toast says
 * "Station set on line N" (V91 A). A network picked in the dialog is the one
 * the line saves (W5f review F1). Also Cinema's own screen rules on the
 * shared shell: the card summary shows Network, and the line summary counts
 * deliverables by Cinema's card rule at the channel fee (W5f review F2),
 * labelled "package" and "spots" (V90 A). Every card field label names its
 * control.
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

const toasts = vi.hoisted(() => {
  const list: Array<{ title?: unknown }> = []
  const toast = (t: { title?: unknown }) => {
    list.push(t)
  }
  return { list, toast }
})

vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: toasts.toast }) }))

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForCinema: async () => [
    { id: 1, publisher_name: "Hoyts" },
    { id: 2, publisher_name: "Village" },
  ],
}))

const { default: CinemaContainer } = await import("@/components/media-containers/CinemaContainer")

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

function labels(dialog: HTMLElement, text: string): HTMLLabelElement[] {
  return [...dialog.querySelectorAll("label")].filter((l) => l.textContent?.trim() === text)
}

const lines = [
  {
    line_item_id: "tst001CN1",
    line_item: 1,
    network: "Hoyts",
    station: "Station 1",
    buy_type: "spots",
    bursts: [{ budget: "1000", buyAmount: "100", startDate: "2026-01-05", endDate: "2026-01-31" }],
  },
  {
    line_item_id: "tst001CN2",
    line_item: 2,
    network: "Village",
    station: "Station 2",
    buy_type: "spots",
    bursts: [{ budget: "500", buyAmount: "100", startDate: "2026-01-05", endDate: "2026-01-31" }],
  },
  {
    line_item_id: "tst001CN3",
    line_item: 3,
    network: null,
    buy_type: "spots",
    bursts: [{ budget: "500", buyAmount: "100", startDate: "2026-01-05", endDate: "2026-01-31" }],
  },
]

describe("Cinema Add Station access (W5f)", () => {
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
    media = []
    toasts.list.length = 0
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  async function mount() {
    act(() => {
      root.render(
        <CinemaContainer
          clientId="client-1"
          feecinema={10}
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
          initialLineItems={lines}
        />,
      )
    })
    await settle()
    for (const n of [1, 2, 3]) {
      const toggle = host.querySelector(
        `button[aria-label="Expand details for cinema line item ${n}"]`,
      ) as HTMLButtonElement
      expect(toggle, `expand ${n}`).toBeTruthy()
      act(() => toggle.click())
    }
  }

  const addButton = (line: number) =>
    [
      ...document.querySelectorAll(`button[aria-label="Add a cinema station for line ${line}"]`),
    ] as HTMLButtonElement[]
  const dialogFor = () =>
    [...document.querySelectorAll('[role="dialog"]')].find((d) =>
      d.textContent?.includes("Add New Cinema Station"),
    ) as HTMLElement | undefined

  async function open(button: HTMLButtonElement) {
    act(() => {
      button.focus()
      button.click()
    })
    await settle(50)
  }

  it("names each line's button, ties one Network label to its control, writes the line and gives focus back", async () => {
    await mount()
    for (const n of [1, 2, 3]) expect(addButton(n).length, `line ${n} button`).toBe(1)
    expect(
      document.querySelectorAll('button[aria-label^="Add a cinema station"]').length,
      "no button without its line",
    ).toBe(3)

    // Every card field label names a control (the highlight wrapper used to take the id).
    const cardLabels = [...host.querySelectorAll("label")]
    expect(cardLabels.length).toBeGreaterThan(20)
    for (const l of cardLabels) {
      expect(l.htmlFor && document.getElementById(l.htmlFor), `label "${l.textContent?.trim()}" names a control`).toBeTruthy()
    }

    // A line with no network: a prompt, no dialog.
    await open(addButton(3)[0])
    expect(dialogFor(), "no dialog without a network").toBeUndefined()

    const [button] = addButton(2)
    await open(button)
    const d = dialogFor()
    expect(d, "dialog").toBeTruthy()
    expect(d!.getAttribute("aria-labelledby")).toBeTruthy()
    expect(d!.contains(document.activeElement), "focus moves into the dialog").toBe(true)
    const network = labels(d!, "Network")
    expect(network.length, "one Network label").toBe(1)
    const networkControl = document.getElementById(network[0].htmlFor)
    expect(networkControl?.getAttribute("role"), "Network names the combobox").toBe("combobox")
    expect(networkControl?.textContent).toContain("Village")
    const nameLabel = labels(d!, "Station name")
    expect(nameLabel.length).toBe(1)
    const name = document.getElementById(nameLabel[0].htmlFor) as HTMLInputElement
    expect(name?.tagName, "labelled station name").toBe("INPUT")
    expect(name.form, "name field is in a form").toBeTruthy()

    // A blank name shows on the field and writes nothing.
    act(() => name.form!.requestSubmit())
    await settle(50)
    expect(dialogFor(), "stays open").toBeTruthy()
    expect(name.getAttribute("aria-invalid")).toBe("true")
    expect(document.getElementById(name.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Station name is required",
    )

    // Pick another network in the dialog: the line saves it with the station.
    act(() => networkControl!.click())
    await settle(50)
    const hoyts = [...document.querySelectorAll("[cmdk-item]")].find(
      (o) => o.textContent?.trim() === "Hoyts",
    ) as HTMLElement
    expect(hoyts, "Hoyts option").toBeTruthy()
    act(() => hoyts.click())
    await settle(50)
    act(() => setInput(name, "Station New"))
    act(() => name.form!.requestSubmit())
    await settle()
    expect(dialogFor(), "closes after adding").toBeUndefined()
    const saved = media[media.length - 1]
    expect(saved.map((l) => [l.network, l.station])).toEqual([
      ["Hoyts", "Station 1"],
      ["Hoyts", "Station New"],
      ["", ""],
    ])
    expect(toasts.list.map((t) => t.title)).toContain("Station set on line 2")
    expect(toasts.list.map((t) => t.title)).not.toContain("Station Added")
    await settle(50)
    expect(document.activeElement, "focus back on Add Station after Add").toBe(button)

    // Escape and Cancel close it, and focus comes back.
    await open(button)
    act(() => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    await settle(50)
    expect(dialogFor(), "Escape closes").toBeUndefined()
    expect(document.activeElement, "focus back after Escape").toBe(button)
    await open(button)
    const cancel = [...dialogFor()!.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Cancel",
    ) as HTMLButtonElement
    act(() => cancel.click())
    await settle(50)
    expect(dialogFor(), "Cancel closes").toBeUndefined()
    expect(document.activeElement, "focus back after Cancel").toBe(button)
  }, 30_000)

  it("the card summary shows the line's network and the line summary counts deliverables by Cinema's card rule", async () => {
    act(() => {
      root.render(
        <CinemaContainer
          clientId="client-1"
          feecinema={12.5}
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
          initialLineItems={[
            {
              line_item_id: "tst001CN1",
              line_item: 1,
              network: "Hoyts",
              buy_type: "package",
              // Saved quantity 8; Cinema's card rule gives $12,000.00 / $1,000.00 = 12.
              bursts: [{ budget: "$12,000.00", buyAmount: "$1,000.00", calculatedValue: 8, startDate: "2026-01-05", endDate: "2026-01-31" }],
            },
            {
              line_item_id: "tst001CN2",
              line_item: 2,
              network: "Village",
              buy_type: "spots",
              budget_includes_fees: true,
              // Fee-inclusive at 12.5%: $9,000.00 gross is $7,875.00 net, / $100.00 = 78.75, rounded 79.
              bursts: [{ budget: "$9,000.00", buyAmount: "$100.00", calculatedValue: 1, startDate: "2026-01-05", endDate: "2026-01-31" }],
            },
          ]}
        />,
      )
    })
    await settle()
    const summary = [...host.querySelectorAll("span")].filter((s) => /media ·/.test(s.textContent ?? ""))
    expect(summary.map((s) => s.textContent?.replace(/^.*· /, ""))).toEqual(["12 package", "79 spots"])
    expect(host.textContent).toContain("Network: Hoyts")
  }, 30_000)
})
