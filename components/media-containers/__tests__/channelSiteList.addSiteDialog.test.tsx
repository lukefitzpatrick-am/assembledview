/**
 * W5c: Add Site on the shared dialog is reachable by keyboard and screen
 * reader. The button has a name, the dialog is a labelled dialog that takes
 * focus, both fields have labels, the name field sits in a form whose submit
 * adds the site (Enter submits a form in a browser), and Escape closes it.
 *
 * W5d (review F1, F3, F4, F7): focus goes back to the Add Site button after
 * Add, Escape and Cancel; the button reads with the right article; a line
 * with no publisher gets a prompt, not the dialog; Digital Audio's dialog
 * picks another publisher on a labelled combobox, and Add writes it.
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

const created: unknown[] = []
const PUBLISHERS = [
  { id: 1, publisher_name: "Pub A" },
  { id: 2, publisher_name: "Pub B" },
]
const create = async (data: { platform: string; site: string }) => {
  created.push(data)
  return { id: 99, ...data }
}

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForDigiVideo: async () => PUBLISHERS,
  getPublishersForDigiAudio: async () => PUBLISHERS,
  getVideoSites: async () => [{ id: 11, platform: "Pub A", site: "Site A1" }],
  getAudioSites: async () => [{ id: 11, platform: "Pub A", site: "Site A1" }],
  createVideoSite: create,
  createAudioSite: create,
}))

const { default: DigitalVideoContainer } = await import(
  "@/components/media-containers/DigitalVideoContainer"
)
const { default: DigitalAudioContainer } = await import(
  "@/components/media-containers/DigitalAudioContainer"
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

describe("Add Site dialog access (W5c, W5d)", () => {
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
    created.length = 0
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const lines = (code: string) => [
    {
      line_item_id: `tst001${code}1`,
      line_item: 1,
      publisher: "Pub A",
      platform: null,
      buy_type: "cpm",
      bursts: [{ budget: "1000", buyAmount: "10", startDate: "2026-01-05", endDate: "2026-01-31" }],
    },
    {
      line_item_id: `tst001${code}2`,
      line_item: 2,
      publisher: null,
      platform: null,
      buy_type: "cpm",
      bursts: [{ budget: "500", buyAmount: "10", startDate: "2026-01-05", endDate: "2026-01-31" }],
    },
  ]

  async function mount(channel: "video" | "audio") {
    const Component: ComponentType<any> =
      channel === "video" ? DigitalVideoContainer : DigitalAudioContainer
    const fee = channel === "video" ? { feedigivideo: 10 } : { feedigiaudio: 10 }
    const media: unknown[][] = []
    act(() => {
      root.render(
        <Component
          clientId="client-1"
          {...fee}
          onTotalMediaChange={noop}
          onBurstsChange={noop}
          onInvestmentChange={noop}
          onLineItemsChange={noop}
          onMediaLineItemsChange={(items: unknown[]) => media.push(items)}
          campaignStartDate={new Date(2026, 0, 5)}
          campaignEndDate={new Date(2026, 2, 31)}
          campaignBudget={0}
          campaignId=""
          mediaTypes={[]}
          initialLineItems={lines(channel === "video" ? "DV" : "DA")}
        />,
      )
    })
    await settle()
    const cardLabel = channel === "video" ? "digi video" : "digital audio"
    for (const n of [1, 2]) {
      const toggle = host.querySelector(
        `button[aria-label="Expand details for ${cardLabel} line item ${n}"]`,
      ) as HTMLButtonElement
      expect(toggle, `expand ${n}`).toBeTruthy()
      act(() => toggle.click())
    }
    return media
  }

  const noun = { video: "Video", audio: "Audio" } as const
  const addButtons = (label: string) =>
    [...document.querySelectorAll(`button[aria-label="${label}"]`)] as HTMLButtonElement[]
  const dialogFor = (channel: "video" | "audio") =>
    [...document.querySelectorAll('[role="dialog"]')].find((d) =>
      d.textContent?.includes(`Add New ${noun[channel]} Site`),
    ) as HTMLElement | undefined

  async function open(button: HTMLButtonElement) {
    act(() => {
      button.focus()
      button.click()
    })
    await settle(50)
  }

  it("opens by a named button, labels its fields, adds on submit and closes on Escape", async () => {
    await mount("video")
    const [button] = addButtons("Add a video site")
    expect(button, "named Add Site button").toBeTruthy()

    // A line with a publisher and no platform can add a site (C-336).
    await open(button)
    const d = dialogFor("video")
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
    expect(dialogFor("video"), "closes after adding").toBeUndefined()
    await settle(50)
    expect(document.activeElement, "focus back on Add Site after Add").toBe(button)

    // Escape closes it without adding, and focus comes back.
    await open(button)
    expect(dialogFor("video")).toBeTruthy()
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      )
    })
    await settle(50)
    expect(dialogFor("video"), "Escape closes").toBeUndefined()
    expect(document.activeElement, "focus back on Add Site after Escape").toBe(button)

    // Cancel closes it without adding, and focus comes back.
    await open(button)
    const cancel = [...dialogFor("video")!.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Cancel",
    ) as HTMLButtonElement
    act(() => cancel.click())
    await settle(50)
    expect(dialogFor("video"), "Cancel closes").toBeUndefined()
    expect(document.activeElement, "focus back on Add Site after Cancel").toBe(button)
    expect(created.length).toBe(1)
  }, 30_000)

  it("asks for a publisher first on a line with none, and opens no dialog", async () => {
    await mount("video")
    const second = addButtons("Add a video site")[1]
    expect(second, "line 2 Add Site button").toBeTruthy()
    await open(second)
    expect(dialogFor("video"), "no dialog without a publisher").toBeUndefined()
    expect(created).toEqual([])
  }, 30_000)

  it("reads 'Add an audio site' and picks another publisher on Digital Audio", async () => {
    const media = await mount("audio")
    expect(addButtons("Add a audio site")).toEqual([])
    const [button] = addButtons("Add an audio site")
    expect(button, "named Add Site button").toBeTruthy()
    await open(button)
    const d = dialogFor("audio")!
    expect(d, "dialog").toBeTruthy()
    const picker = labelled(d, "Publisher") as HTMLButtonElement
    expect(picker?.getAttribute("role"), "labelled publisher combobox").toBe("combobox")
    act(() => picker.click())
    await settle(50)
    const option = [...document.querySelectorAll("[cmdk-item]")].find(
      (o) => o.textContent?.trim() === "Pub B",
    ) as HTMLElement
    expect(option, "Pub B option").toBeTruthy()
    act(() => option.click())
    await settle(50)
    expect(picker.textContent).toContain("Pub B")
    act(() => setInput(labelled(d, "Site name") as HTMLInputElement, "Site New"))
    act(() => (labelled(d, "Site name") as HTMLInputElement).form!.requestSubmit())
    await settle()
    expect(created).toEqual([{ site: "Site New", platform: "Pub B" }])
    await settle(50)
    expect(document.activeElement, "focus back on Add Site").toBe(button)
    const saved = media.at(-1) as { publisher: string; platform: string; site: string }[]
    expect([saved[0].publisher, saved[0].platform, saved[0].site]).toEqual([
      "Pub B",
      "Pub B",
      "Site New",
    ])
  }, 30_000)
})
