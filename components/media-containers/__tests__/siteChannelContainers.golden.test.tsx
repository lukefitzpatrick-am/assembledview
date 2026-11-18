/**
 * W5c goldens: the four site channels (Digital Video, Digital Display,
 * Digital Audio, BVOD), pinned on their old containers before any moves onto
 * the shared channel container.
 *
 * Records what the container hands the plan page:
 * - the save payload (onMediaLineItemsChange) and the persisted bursts it
 *   becomes (extractAndFormatBursts, the bursts_json write contract)
 * - the billing schedule input (onBurstsChange) and the ad serving rate its
 *   media type label resolves to (C-330)
 * - the Excel rows (onLineItemsChange)
 * - the monthly investment, the header totals and the header line count
 * - the site list: the site options a line offers after its publisher
 *   changes, and what the Add Site dialog creates and writes to the line
 *
 * Key order is canonical (keys sorted): the save payload is jsonb and every
 * reader takes fields by name.
 *
 * Hydrate covers the buy types live on each channel, fee-inclusive and
 * client-pays lines, a saved burst `fee`, ad serving overrides, a burst with
 * no dates and one with no end date (Date is pinned), a line saved with no
 * bursts, a stale calculatedValue, a bonus quantity saved as a string, No Ad
 * Serving (FB-6), and lines with a publisher but no platform (most live
 * lines). Then it drives: fee-inclusive ticked on a collapsed card, card
 * typing on an expanded card (C-333: Digital Audio and BVOD round), Add /
 * Duplicate / Remove burst, a typed bonus quantity, a reload with a changed budget, a publisher
 * change, a site pick, Add Site, a buy type change to Bonus, Remove line,
 * Duplicate and Add line, an edited expert grid Apply, and the create path.
 *
 * Regenerate only for an intended behaviour change:
 *   UPDATE_GOLDEN=1 npx vitest run components/media-containers/__tests__/siteChannelContainers.golden.test.tsx
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, type ComponentType } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { resolveAdServingRateForMediaType } from "@/lib/billing/adServingRateResolver"
import { extractAndFormatBursts } from "@/lib/mediaplan/formatBurstsForPersist"
import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

const PUBLISHERS = [
  { id: 1, publisher_name: "Pub A" },
  { id: 2, publisher_name: "Pub B" },
]
const SITES = [
  { id: 11, platform: "Pub A", site: "Site A1" },
  { id: 12, platform: "pub a ", site: "Site A2" },
  { id: 21, platform: "Pub B", site: "Site B1" },
  { id: 22, platform: "Pub B", site: "Site B2" },
  { id: 23, platform: "Pub B", site: "" },
]
const created: { channel: string; data: unknown }[] = []
const createSite = (channel: string) => async (data: { platform: string; site: string }) => {
  created.push({ channel, data })
  return { id: 99, ...data }
}

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForDigiVideo: async () => PUBLISHERS,
  getPublishersForDigiDisplay: async () => PUBLISHERS,
  getPublishersForDigiAudio: async () => PUBLISHERS,
  getPublishersForBvod: async () => PUBLISHERS,
  getVideoSites: async () => SITES,
  getDisplaySites: async () => SITES,
  getAudioSites: async () => SITES,
  getBVODSites: async () => SITES,
  createVideoSite: createSite("video"),
  createDisplaySite: createSite("display"),
  createAudioSite: createSite("audio"),
  createBVODSite: createSite("bvod"),
}))

const { default: DigitalVideoContainer } = await import(
  "@/components/media-containers/DigitalVideoContainer"
)
const { default: DigitalDisplayContainer } = await import(
  "@/components/media-containers/DigitalDisplayContainer"
)
const { default: DigitalAudioContainer } = await import(
  "@/components/media-containers/DigitalAudioContainer"
)
const { default: BVODContainer } = await import("@/components/media-containers/BVODContainer")

const FEE = 12.5
// Not midnight on purpose: a burst with no saved date falls back from these.
const CAMPAIGN_START = new Date(2026, 0, 5, 9, 15)
const CAMPAIGN_END = new Date(2026, 2, 31, 15, 30)
const NOW = new Date("2026-02-10T03:04:05.678Z")
const AD_SERVING_RATES = { video: 1.1, audio: 2.2, display: 3.3, imp: 4.4 }

type Recorded = {
  media: any[] | null
  excel: any[] | null
  billing: any[] | null
  investment: any[] | null
  totals: [number, number] | null
}

function burst(
  budget: unknown,
  buyAmount: unknown,
  start?: string,
  end?: string,
  extra: Record<string, unknown> = {},
) {
  const b: Record<string, unknown> = { budget, buyAmount }
  if (start !== undefined) b.startDate = start
  if (end !== undefined) b.endDate = end
  return { ...b, ...extra }
}

let idBase = 7000

function apiLine(code: string, n: number, extra: Record<string, unknown>) {
  return {
    id: idBase + n,
    line_item_id: `tst001${code}${n}`,
    line_item: n,
    publisher: "Pub A",
    platform: "Pub A",
    site: `Site A${(n % 2) + 1}`,
    bid_strategy: "manual_cpc",
    buy_type: "cpm",
    creative_targeting: `placement ${n}`,
    creative: `creative ${n}`,
    targeting_attribute: `targeting ${n}`,
    buying_demo: "P18+",
    market: "National",
    fixed_cost_media: false,
    client_pays_for_media: false,
    budget_includes_fees: false,
    no_adserving: false,
    ...extra,
  }
}

type LineSpec = Record<string, unknown>

/** Lines 1 to 5 are on every channel; the rest are each channel's live buy types. */
function siteLines(code: string, own: LineSpec[], budget = "$5,000.00") {
  const L = (n: number, extra: LineSpec) => apiLine(code, n, extra)
  const common = [
    // cpm, two bursts, a saved fee and ad serving overrides on burst 1.
    L(1, {
      bursts: [
        burst(budget, "$12.50", "2026-01-12", "2026-02-15", {
          fee: 625,
          adServingRatePct: 0.5,
          adServingImpressions: 1000,
        }),
        burst("3000", "15", "2026-02-16", "2026-03-15"),
      ],
    }),
    // Publisher with no platform (most live lines); fee-inclusive cpm.
    L(2, {
      platform: null,
      budget_includes_fees: true,
      bursts: [burst("$8,000.00", "$16.00", "2026-02-09", "2026-03-08")],
    }),
    // No dates at all; client pays.
    L(3, {
      buy_type: null,
      client_pays_for_media: true,
      bursts: [burst("$1,000.00", "$20.00")],
    }),
    // FB-6 No Ad Serving; a stale calculatedValue; no end date; bursts as a string.
    L(4, {
      no_adserving: true,
      bursts: JSON.stringify([
        burst("$2,000.00", "$2.00", "2026-02-02", undefined, { calculatedValue: 99999 }),
      ]),
    }),
    // A bonus quantity saved as a string.
    L(5, {
      buy_type: "bonus",
      no_adserving: true,
      bursts: [burst("0", "0", "2026-03-02", "2026-03-29", { calculatedValue: "500" })],
    }),
  ]
  return [...common, ...own.map((extra, i) => L(6 + i, extra))]
}

type Channel = {
  name: string
  Component: ComponentType<any>
  feeProp: string
  cardLabel: string
  lines: (budget?: string) => any[]
}

const CHANNELS: Channel[] = [
  {
    name: "digitalVideo",
    Component: DigitalVideoContainer,
    feeProp: "feedigivideo",
    cardLabel: "digi video",
    lines: (budget) =>
      siteLines(
        "DV",
        [
          { buy_type: "cpv", bursts: [burst("$3,000.00", "$0.05", "2026-01-19", "2026-02-22")] },
          {
            buy_type: "fixed_cost",
            no_adserving: true,
            fixed_cost_media: true,
            bursts: [burst("$4,000.00", "$4,000.00", "2026-01-05", "2026-01-31")],
          },
          { buy_type: "", bursts: [] },
        ],
        budget,
      ),
  },
  {
    name: "digitalDisplay",
    Component: DigitalDisplayContainer,
    feeProp: "feedigidisplay",
    cardLabel: "digital display",
    lines: (budget) =>
      siteLines(
        "DD",
        [
          {
            buy_type: "fixed_cost",
            budget_includes_fees: true,
            bursts: [burst("$6,000.00", "$6,000.00", "2026-01-05", "2026-01-31")],
          },
          { buy_type: "cpc", bursts: [burst("$2,500.00", "$1.25", "2026-01-12", "2026-02-08")] },
          {
            buy_type: "cpv",
            fixed_cost_media: true,
            bursts: [burst("$1,500.00", "$0.10", "2026-02-02", "2026-02-28")],
          },
          {
            buy_type: "package_inclusions",
            no_adserving: true,
            bursts: [burst("0", "0", "2026-02-02", "2026-02-22", { calculatedValue: 3 })],
          },
          { buy_type: "cpm", bursts: [] },
        ],
        budget,
      ),
  },
  {
    name: "digitalAudio",
    Component: DigitalAudioContainer,
    feeProp: "feedigiaudio",
    cardLabel: "digital audio",
    lines: (budget) =>
      siteLines(
        "DA",
        [
          {
            buy_type: "fixed_cost",
            fixed_cost_media: true,
            no_adserving: true,
            bursts: [burst("$4,000.00", "$4,000.00", "2026-01-05", "2026-01-31")],
          },
          {
            buy_type: "package",
            bursts: [burst("$12,000.00", "$1,000.00", "2026-01-05", "2026-01-31", { calculatedValue: 8 })],
          },
          {
            buy_type: "package_inclusions",
            budget_includes_fees: true,
            bursts: [burst("0", "0", "2026-02-02", "2026-02-22", { calculatedValue: 3 })],
          },
          { buy_type: "", bursts: [] },
        ],
        budget,
      ),
  },
  {
    name: "bvod",
    Component: BVODContainer,
    feeProp: "feebvod",
    cardLabel: "bvod",
    lines: (budget) =>
      siteLines(
        "BV",
        [
          { buy_type: "cpv", bursts: [burst("$3,000.00", "$0.05", "2026-01-19", "2026-02-22")] },
          {
            buy_type: "package_inclusions",
            client_pays_for_media: true,
            no_adserving: true,
            bursts: [burst("0", "0", "2026-02-02", "2026-02-22", { calculatedValue: 3 })],
          },
          {
            buy_type: "package",
            bursts: [burst("$12,000.00", "$1,000.00", "2026-01-05", "2026-01-31", { calculatedValue: 8 })],
          },
          { buy_type: "cpm", client_pays_for_media: true, bursts: [] },
        ],
        budget,
      ),
  },
]

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      out[key] = canonical((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

function strip(value: unknown): unknown {
  return canonical(
    JSON.parse(JSON.stringify(value, (key, v) => (key === "_reactKey" ? undefined : v))),
  )
}

function headerLineCount(): string | null {
  const span = [...document.querySelectorAll("span")].find((s) =>
    /^\d+ line items?$/.test(s.textContent?.trim() ?? ""),
  )
  return span?.textContent?.trim() ?? null
}

function snapshot(rec: Recorded) {
  const media = rec.media ?? []
  const billing = rec.billing ?? []
  return strip({
    media,
    persistedBursts: media.map((li) => extractAndFormatBursts(li, li.feePct)),
    billing: rec.billing,
    adServingRates: [...new Set(billing.map((b) => b.mediaType))].map((t) => [
      t,
      resolveAdServingRateForMediaType(t, AD_SERVING_RATES),
    ]),
    excel: rec.excel,
    investment: rec.investment,
    totals: rec.totals,
    lineCount: headerLineCount(),
  })
}

async function settle(ms = 450) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

function typeAndBlur(selector: string, value: string) {
  const el = document.querySelector(selector) as HTMLInputElement
  expect(el, selector).toBeTruthy()
  act(() => setInput(el, value))
  act(() => el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
}

function buttons(text: string): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")].filter(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement[]
}

function byLabel(label: string): HTMLButtonElement[] {
  return [...document.querySelectorAll(`button[aria-label="${label}"]`)] as HTMLButtonElement[]
}

/** The form item a card label names. */
function itemForLabel(text: string, nth: number): HTMLElement {
  const labels = [...document.querySelectorAll("label")].filter(
    (l) => l.textContent?.trim() === text,
  )
  const label = labels[nth]
  expect(label, `${text} #${nth}`).toBeTruthy()
  return label.parentElement as HTMLElement
}

/** The control a form label names (Radix checkbox or combobox trigger). */
function controlForLabel(text: string, nth: number): HTMLElement {
  const control = itemForLabel(text, nth).querySelector(
    '[role="checkbox"], [role="combobox"]',
  ) as HTMLElement
  expect(control, `${text} #${nth} control`).toBeTruthy()
  return control
}

function openOptions(): string[] {
  return [...document.querySelectorAll("[cmdk-item]")].map((o) => o.textContent?.trim() ?? "")
}

function pickOption(label: string) {
  const option = [...document.querySelectorAll("[cmdk-item]")].find(
    (o) => o.textContent?.trim() === label,
  ) as HTMLElement | undefined
  expect(option, `option ${label}`).toBeTruthy()
  act(() => option!.click())
}

describe.each(CHANNELS)("$name container golden (W5c)", (channel) => {
  let host: HTMLDivElement
  let root: Root
  let rec: Recorded

  const fresh = (): Recorded => ({
    media: null,
    excel: null,
    billing: null,
    investment: null,
    totals: null,
  })

  const callbacks = {
    onTotalMediaChange: (m: number, f: number) => {
      rec.totals = [m, f]
    },
    onBurstsChange: (b: any[]) => {
      rec.billing = b
    },
    onInvestmentChange: (i: any[]) => {
      rec.investment = i
    },
    onLineItemsChange: (i: any[]) => {
      rec.excel = i
    },
    onMediaLineItemsChange: (i: any[]) => {
      rec.media = i
    },
  }

  function mount(initialLineItems: any[]) {
    const { Component } = channel
    act(() => {
      root.render(
        <Component
          clientId="client-1"
          {...{ [channel.feeProp]: FEE }}
          {...callbacks}
          campaignStartDate={CAMPAIGN_START}
          campaignEndDate={CAMPAIGN_END}
          campaignBudget={100000}
          campaignId=""
          mediaTypes={[channel.name]}
          initialLineItems={initialLineItems}
        />,
      )
    })
  }

  function expand(lineNumber: number) {
    const toggle = byLabel(`Expand details for ${channel.cardLabel} line item ${lineNumber}`)[0]
    expect(toggle, `expand ${lineNumber}`).toBeTruthy()
    act(() => toggle.click())
  }

  function ensureExpanded(lineNumber: number) {
    if (byLabel(`Expand details for ${channel.cardLabel} line item ${lineNumber}`).length > 0) {
      expand(lineNumber)
    }
  }

  beforeAll(() => {
    // jsdom has no layout APIs; Radix checkboxes and cmdk lists call these.
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
    vi.useFakeTimers({ toFake: ["Date"], now: NOW })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    resetWeekStartsOnStore()
    created.length = 0
    rec = fresh()
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("pins hydrate, card edits, the site list, Add Site, reload, buy type, remove, duplicate, expert Apply and create", async () => {
    const out: Record<string, unknown> = {}

    // 1. Edit hydrate across the channel's live buy types.
    mount(channel.lines())
    await settle()
    out.hydrate = snapshot(rec)
    const n = (rec.media ?? []).length

    // 2. Fee-inclusive ticked on line 1 while its card is collapsed: only the
    //    container recomputes deliverables (no card field is mounted).
    act(() => controlForLabel("Budget Includes Fees", 0).click())
    await settle()
    out.feeInclusiveCollapsed = snapshot(rec)

    // 3. Expand line 1 and type a budget and a buy amount on burst 2 (C-333).
    expand(1)
    typeAndBlur('input[name$=".0.bursts.1.budget"]', "$7,777.7")
    typeAndBlur('input[name$=".0.bursts.1.buyAmount"]', "3.3")
    await settle()
    out.typed = snapshot(rec)

    // 4. Burst edits on line 1: Duplicate (copies the last burst), Add, then
    //    Remove the typed burst.
    act(() => byLabel("Duplicate burst")[0].click())
    await settle()
    act(() => byLabel("Add burst")[0].click())
    await settle()
    act(() => byLabel("Remove burst")[1].click())
    await settle()
    out.burstEdits = snapshot(rec)

    // 4b. Expand line 5 (bonus) and type a quantity: the input writes a
    //     string, which billing and save carry as they find it.
    expand(5)
    const bonus = [...document.querySelectorAll('input[type="number"]')].find(
      (i) => (i as HTMLInputElement).value === "500",
    ) as HTMLInputElement | undefined
    expect(bonus, "bonus input").toBeTruthy()
    act(() => setInput(bonus!, "250"))
    await settle()
    out.bonusTyped = snapshot(rec)

    // 5. The page passes the same lines again as a new array, line 1's first
    //    budget changed.
    mount(channel.lines("$9,999.00"))
    await settle()
    out.reload = snapshot(rec)

    // 6. Line 1 publisher changed to Pub B: the line's platform follows and
    //    its site clears. Then the site list offers Pub B's sites only.
    ensureExpanded(1)
    act(() => controlForLabel("Publisher", 0).click())
    await settle(50)
    pickOption("Pub B")
    await settle()
    out.publisherChange = snapshot(rec)
    act(() => controlForLabel("Site", 0).click())
    await settle(50)
    out.siteOptions = openOptions()
    pickOption("Site B2")
    await settle()
    out.sitePick = snapshot(rec)

    // 7. Add Site from line 1: the dialog takes the line's publisher, creates
    //    the site and writes it to the line.
    const siteItem = itemForLabel("Site", 0)
    const addSite = [...siteItem.querySelectorAll("button")].find(
      (b) => b.getAttribute("role") !== "combobox",
    ) as HTMLButtonElement | undefined
    expect(addSite, "add site button").toBeTruthy()
    act(() => addSite!.click())
    await settle(50)
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find((d) =>
      /Add New .* Site/.test(d.textContent ?? ""),
    ) as HTMLElement | undefined
    expect(dialog, "add site dialog").toBeTruthy()
    const nameInput = [...dialog!.querySelectorAll("input")].find(
      (i) => !(i as HTMLInputElement).readOnly,
    ) as HTMLInputElement
    expect(nameInput, "site name input").toBeTruthy()
    act(() => setInput(nameInput, "Site New"))
    act(() => buttons("Add Site")[0].click())
    await settle()
    out.addSiteCreated = canonical(created.map((c) => c.data))
    out.addSite = snapshot(rec)

    // 8. Line 1 buy type changed to Bonus (bonus zeroes budget and buy amount).
    ensureExpanded(1)
    act(() => controlForLabel("Buy Type", 0).click())
    await settle(50)
    pickOption("Bonus")
    await settle()
    out.buyTypeToBonus = snapshot(rec)

    // 9. Remove line 3.
    const remove = buttons("Remove")
    expect(remove.length).toBe(n)
    act(() => remove[2].click())
    await settle()
    out.removeLine = snapshot(rec)

    // 10. Duplicate line 2, then Add a line.
    act(() => buttons("Duplicate")[1].click())
    await settle()
    const add = buttons("Add Line Item")
    expect(add.length).toBe(1)
    act(() => add[0].click())
    await settle()
    out.duplicateAndAdd = snapshot(rec)

    // 11. Expert grid: edit a row 2 text cell, then Apply. jsdom has no layout,
    //     so give the grid's scroller a height or the virtualiser mounts no rows.
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.tagName === "THEAD" ? 40 : 2000
      })
    act(() => buttons("Schedule grid")[0].click())
    await settle(100)
    const grid = document.querySelector('[role="dialog"]') as HTMLElement
    expect(grid, "expert dialog").toBeTruthy()
    const cell = [...grid.querySelectorAll("input")].find(
      (i) => (i as HTMLInputElement).value === "creative 2",
    ) as HTMLInputElement | undefined
    expect(cell, "expert text cell").toBeTruthy()
    act(() => setInput(cell!, "creative 2 edited"))
    await settle(50)
    const apply = buttons("Apply to plan (not saved yet)")
    expect(apply.length).toBe(1)
    act(() => apply[0].click())
    offsetHeight.mockRestore()
    await settle()
    out.expertApply = snapshot(rec)

    act(() => root.unmount())
    root = createRoot(host)
    rec = fresh()

    // 12. Create: empty channel, the placeholder Add, then a typed budget.
    mount([])
    await settle()
    const placeholderAdd = buttons("Add line item")
    expect(placeholderAdd.length).toBe(1)
    act(() => placeholderAdd[0].click())
    await settle()
    typeAndBlur('input[name$=".0.bursts.0.budget"]', "4321")
    await settle()
    out.create = snapshot(rec)

    const golden = resolve(
      process.cwd(),
      `components/media-containers/__tests__/fixtures/${channel.name}Container.golden.json`,
    )
    const text = `${JSON.stringify(out, null, 2)}\n`
    if (process.env.UPDATE_GOLDEN === "1") {
      writeFileSync(golden, text)
    }
    expect(text).toBe(readFileSync(golden, "utf8"))
  }, 90_000)
})
