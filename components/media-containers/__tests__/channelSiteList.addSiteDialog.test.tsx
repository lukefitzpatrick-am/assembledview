/**
 * W5c: Add Site on the shared dialog is reachable by keyboard and screen
 * reader. The button has a name, the dialog is a labelled dialog that takes
 * focus, both fields have labels, the name field sits in a form whose submit
 * adds the site (Enter submits a form in a browser), and Escape closes it.
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

const created: unknown[] = []

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForDigiVideo: async () => [{ id: 1, publisher_name: "Pub A" }],
  getVideoSites: async () => [{ id: 11, platform: "Pub A", site: "Site A1" }],
  createVideoSite: async (data: { platform: string; site: string }) => {
    created.push(data)
    return { id: 99, ...data }
  },
}))

const { default: DigitalVideoContainer } = await import(
  "@/components/media-containers/DigitalVideoContainer"
)

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

/** The control a label names, through its `for` attribute. */
function labelled(dialog: HTMLElement, text: string): HTMLElement | null {
  const label = [...dialog.querySelectorAll("label")].find((l) => l.textContent?.trim() === text)
  const id = label?.getAttribute("for")
  return id ? dialog.ownerDocument.getElementById(id) : null
}

describe("Add Site dialog access (W5c)", () => {
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
    created.length = 0
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("opens by a named button, labels its fields, adds on submit and closes on Escape", async () => {
    const line = {
      line_item_id: "tst001DV1",
      line_item: 1,
      publisher: "Pub A",
      platform: null,
      buy_type: "cpm",
      bursts: [{ budget: "1000", buyAmount: "10", startDate: "2026-01-05", endDate: "2026-01-31" }],
    }
    act(() => {
      root.render(
        <DigitalVideoContainer
          clientId="client-1"
          feedigivideo={10}
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
          initialLineItems={[line]}
        />,
      )
    })
    await settle()
    const toggle = host.querySelector(
      'button[aria-label="Expand details for digi video line item 1"]',
    ) as HTMLButtonElement
    act(() => toggle.click())

    const open = () => {
      const button = document.querySelector(
        'button[aria-label="Add a video site"]',
      ) as HTMLButtonElement | null
      expect(button, "named Add Site button").toBeTruthy()
      act(() => button!.click())
    }
    const dialog = () =>
      [...document.querySelectorAll('[role="dialog"]')].find((d) =>
        d.textContent?.includes("Add New Video Site"),
      ) as HTMLElement | undefined

    // A line with a publisher and no platform can add a site (C-336).
    open()
    await settle(50)
    const d = dialog()
    expect(d, "dialog").toBeTruthy()
    expect(d!.getAttribute("aria-labelledby")).toBeTruthy()
    expect(d!.contains(document.activeElement), "focus moves into the dialog").toBe(true)
    const publisher = labelled(d!, "Publisher") as HTMLInputElement
    const name = labelled(d!, "Site name") as HTMLInputElement
    expect(publisher?.value).toBe("Pub A")
    expect(publisher?.readOnly).toBe(true)
    expect(name, "labelled site name").toBeTruthy()
    expect(name.form, "name field is in a form").toBeTruthy()

    act(() => setInput(name, "Site New"))
    act(() => name.form!.requestSubmit())
    await settle()
    expect(created).toEqual([{ site: "Site New", platform: "Pub A" }])
    expect(dialog(), "closes after adding").toBeUndefined()

    // Escape closes it without adding.
    open()
    await settle(50)
    expect(dialog()).toBeTruthy()
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      )
    })
    await settle(50)
    expect(dialog(), "Escape closes").toBeUndefined()
    expect(created.length).toBe(1)
  }, 30_000)
})
