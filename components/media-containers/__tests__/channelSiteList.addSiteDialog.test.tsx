/**
 * W5c: Add Site on the shared dialog is reachable by keyboard and screen
 * reader. The button has a name, the dialog is a labelled dialog that takes
 * focus, both fields have labels, the name field sits in a form whose submit
 * adds the site (Enter submits a form in a browser), and Escape closes it.
 *
 * W5d (review F1, F3, F4, F7): focus goes back to the Add Site button after
 * Add, Escape and Cancel; the button reads with the right article; a line
 * with no publisher gets a prompt, not the dialog; the channels with a
 * publisher pick take another publisher on a labelled combobox, and Add
 * writes it.
 *
 * W5e (review F4, F6): all four site channels; each card's button names its
 * line ("Add a BVOD site for line 2"), so a screen reader's button list can
 * tell them apart.
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { act, type ComponentType } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { Announcer } from "@/components/ui/announcer"
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
const sites = async () => [{ id: 11, platform: "Pub A", site: "Site A1" }]

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForDigiVideo: async () => PUBLISHERS,
  getPublishersForDigiAudio: async () => PUBLISHERS,
  getPublishersForDigiDisplay: async () => PUBLISHERS,
  getPublishersForBvod: async () => PUBLISHERS,
  getVideoSites: sites,
  getAudioSites: sites,
  getDisplaySites: sites,
  getBVODSites: sites,
  createVideoSite: create,
  createAudioSite: create,
  createDisplaySite: create,
  createBVODSite: create,
}))

type Channel = {
  name: string
  Component: ComponentType<any>
  feeProp: string
  code: string
  cardLabel: string
  noun: string
  /** The button's name without its line. */
  button: string
  /** The dialog picks another publisher (else a read-only publisher box). */
  pickPublisher: boolean
}

const CHANNELS: Channel[] = [
  {
    name: "digitalVideo",
    Component: (await import("@/components/media-containers/DigitalVideoContainer")).default,
    feeProp: "feedigivideo",
    code: "DV",
    cardLabel: "digi video",
    noun: "Video",
    button: "Add a video site",
    pickPublisher: false,
  },
  {
    name: "digitalAudio",
    Component: (await import("@/components/media-containers/DigitalAudioContainer")).default,
    feeProp: "feedigiaudio",
    code: "DA",
    cardLabel: "digital audio",
    noun: "Audio",
    button: "Add an audio site",
    pickPublisher: true,
  },
  {
    name: "digitalDisplay",
    Component: (await import("@/components/media-containers/DigitalDisplayContainer")).default,
    feeProp: "feedigidisplay",
    code: "DD",
    cardLabel: "digital display",
    noun: "Display",
    button: "Add a display site",
    pickPublisher: true,
  },
  {
    name: "bvod",
    Component: (await import("@/components/media-containers/BVODContainer")).default,
    feeProp: "feebvod",
    code: "BV",
    cardLabel: "bvod",
    noun: "BVOD",
    button: "Add a BVOD site",
    pickPublisher: true,
  },
]

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

describe.each(CHANNELS)("$name Add Site dialog access (W5c, W5d, W5e)", (channel) => {
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

  const lines = (code: string, firstPublisher = "Pub A") => [
    {
      line_item_id: `tst001${code}1`,
      line_item: 1,
      publisher: firstPublisher,
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

  async function mount(firstPublisher?: string) {
    const media: unknown[][] = []
    const { Component } = channel
    act(() => {
      root.render(
        <Component
          clientId="client-1"
          {...{ [channel.feeProp]: 10 }}
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
          initialLineItems={lines(channel.code, firstPublisher)}
        />,
      )
    })
    await settle()
    for (const n of [1, 2]) {
      const toggle = host.querySelector(
        `button[aria-label="Expand details for ${channel.cardLabel} line item ${n}"]`,
      ) as HTMLButtonElement
      expect(toggle, `expand ${n}`).toBeTruthy()
      act(() => toggle.click())
    }
    return media
  }

  const addButton = (line: number) =>
    [...document.querySelectorAll(`button[aria-label="${channel.button} for line ${line}"]`)] as HTMLButtonElement[]
  const dialogFor = () =>
    [...document.querySelectorAll('[role="dialog"]')].find((d) =>
      d.textContent?.includes(`Add New ${channel.noun} Site`),
    ) as HTMLElement | undefined

  async function open(button: HTMLButtonElement) {
    act(() => {
      button.focus()
      button.click()
    })
    await settle(50)
  }

  it("names each line's button, labels its fields, adds on submit and gives focus back", async () => {
    await mount()
    // One button per line, each named for its line (review F6).
    expect(addButton(1).length, "line 1 button").toBe(1)
    expect(addButton(2).length, "line 2 button").toBe(1)
    expect(
      [...document.querySelectorAll(`button[aria-label^="${channel.button}"]`)].length,
      "no button without its line",
    ).toBe(2)
    const [button] = addButton(1)

    // A line with a publisher and no platform can add a site (C-336).
    await open(button)
    const d = dialogFor()
    expect(d, "dialog").toBeTruthy()
    expect(d!.getAttribute("aria-labelledby")).toBeTruthy()
    expect(d!.contains(document.activeElement), "focus moves into the dialog").toBe(true)
    const publisher = labelled(d!, "Publisher") as HTMLElement
    const name = labelled(d!, "Site name") as HTMLInputElement
    if (channel.pickPublisher) {
      expect(publisher?.getAttribute("role"), "labelled publisher combobox").toBe("combobox")
      expect(publisher.textContent).toContain("Pub A")
    } else {
      expect((publisher as HTMLInputElement)?.value).toBe("Pub A")
      expect((publisher as HTMLInputElement)?.readOnly).toBe(true)
    }
    expect(name, "labelled site name").toBeTruthy()
    expect(name.form, "name field is in a form").toBeTruthy()

    act(() => setInput(name, "Site New"))
    act(() => name.form!.requestSubmit())
    await settle()
    expect(created).toEqual([{ site: "Site New", platform: "Pub A" }])
    expect(dialogFor(), "closes after adding").toBeUndefined()
    await settle(50)
    expect(document.activeElement, "focus back on Add Site after Add").toBe(button)

    // Escape closes it without adding, and focus comes back.
    await open(button)
    expect(dialogFor()).toBeTruthy()
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      )
    })
    await settle(50)
    expect(dialogFor(), "Escape closes").toBeUndefined()
    expect(document.activeElement, "focus back on Add Site after Escape").toBe(button)

    // Cancel closes it without adding, and focus comes back.
    await open(button)
    const cancel = [...dialogFor()!.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Cancel",
    ) as HTMLButtonElement
    act(() => cancel.click())
    await settle(50)
    expect(dialogFor(), "Cancel closes").toBeUndefined()
    expect(document.activeElement, "focus back on Add Site after Cancel").toBe(button)
    expect(created.length).toBe(1)
  }, 30_000)

  it("a blank site name shows on the field, takes focus, is said once and adds nothing (B58)", async () => {
    const announcerHost = document.createElement("div")
    document.body.appendChild(announcerHost)
    const announcerRoot = createRoot(announcerHost)
    act(() => announcerRoot.render(<Announcer />))
    try {
      await mount()
      const [button] = addButton(1)
      await open(button)
      const d = dialogFor()!
      const name = labelled(d, "Site name") as HTMLInputElement
      act(() => name.form!.requestSubmit())
      await settle(50)
      expect(created).toEqual([])
      expect(dialogFor(), "stays open").toBeTruthy()
      expect(name.getAttribute("aria-invalid")).toBe("true")
      const described = document.getElementById(name.getAttribute("aria-describedby") ?? "")
      expect(described?.textContent).toBe("Site name is required")
      expect(document.activeElement).toBe(name)
      const said = announcerHost.querySelector('[data-announcer="assertive"]')!
      expect(said.children).toHaveLength(1)
      expect(said.textContent).toBe("Fix 1 field: Site name: Site name is required")
      // Typing clears it; Add then adds as before.
      act(() => setInput(name, "Site New"))
      expect(name.getAttribute("aria-invalid")).toBeNull()
      act(() => name.form!.requestSubmit())
      await settle()
      expect(created).toEqual([{ site: "Site New", platform: "Pub A" }])
    } finally {
      act(() => announcerRoot.unmount())
      announcerHost.remove()
    }
  }, 30_000)

  it.runIf(channel.pickPublisher)(
    "B58fix R5: a blank publisher marks the publisher combobox (aria-invalid, aria-describedby), takes focus and adds nothing",
    async () => {
      const announcerHost = document.createElement("div")
      document.body.appendChild(announcerHost)
      const announcerRoot = createRoot(announcerHost)
      act(() => announcerRoot.render(<Announcer />))
      try {
        // A line whose stored publisher is only spaces opens the dialog with no publisher.
        await mount("  ")
        const [button] = addButton(1)
        await open(button)
        const d = dialogFor()!
        expect(d, "dialog").toBeTruthy()
        const picker = labelled(d, "Publisher") as HTMLButtonElement
        expect(picker.getAttribute("role")).toBe("combobox")
        const name = labelled(d, "Site name") as HTMLInputElement
        act(() => setInput(name, "Site New"))
        act(() => name.form!.requestSubmit())
        await settle(50)
        expect(created).toEqual([])
        expect(picker.getAttribute("aria-invalid")).toBe("true")
        expect(document.getElementById(picker.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
          "Publisher is required",
        )
        expect(name.getAttribute("aria-invalid")).toBeNull()
        expect(document.activeElement).toBe(picker)
        expect(announcerHost.querySelector('[data-announcer="assertive"]')?.textContent).toBe(
          "Fix 1 field: Publisher: Publisher is required",
        )
      } finally {
        act(() => announcerRoot.unmount())
        announcerHost.remove()
      }
    },
    30_000,
  )

  it("asks for a publisher first on a line with none, and opens no dialog", async () => {
    await mount()
    const [second] = addButton(2)
    expect(second, "line 2 Add Site button").toBeTruthy()
    await open(second)
    expect(dialogFor(), "no dialog without a publisher").toBeUndefined()
    expect(created).toEqual([])
  }, 30_000)

  it.runIf(channel.pickPublisher)("picks another publisher on a labelled combobox, and Add writes it", async () => {
    const media = await mount()
    const [button] = addButton(1)
    await open(button)
    const d = dialogFor()!
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
