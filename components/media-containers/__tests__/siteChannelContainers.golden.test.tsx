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
 * W5d adds (review F2 to F5, and the Display and BVOD gaps): each channel's
 * own site catalogue mock (a call to another channel's catalogue fails the
 * test), the Add Site publisher pick where the dialog has one, the site list
 * refreshed after Add, the card summary cells, the grid's site list, a
 * cleared bonus input, a bonus line changed to Fixed Cost, a blank buy
 * type, a blank site (BVOD falls back to station, then publisher), Display's
 * numeric budget, BVOD's snake-case burst keys, and a line with no line id.
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
  { id: 24, platform: " pub  b", site: "Site B3" },
]
const created: { channel: string; data: { platform: string; site: string } }[] = []
/** The catalogue the channel under test reads and writes; any other is a failure (review F2). */
let ownCatalogue = ""
const wrongCatalogue: string[] = []
const fetchSites = (channel: string) => async () => {
  if (channel !== ownCatalogue) {
    wrongCatalogue.push(`fetch ${channel}`)
    throw new Error(`read the ${channel} catalogue`)
  }
  // Sites added in this test come back on the next read (the list refreshes after Add).
  return [
    ...SITES,
    ...created.map((c, i) => ({ id: 99 + i, platform: c.data.platform, site: `${c.data.site} (catalogue)` })),
  ]
}
const createSite = (channel: string) => async (data: { platform: string; site: string }) => {
  if (channel !== ownCatalogue) {
    wrongCatalogue.push(`create ${channel}`)
    throw new Error(`wrote the ${channel} catalogue`)
  }
  created.push({ channel, data })
  // The catalogue's own spelling, so a line takes the created site's name.
  return { id: 99, platform: data.platform, site: `${data.site} (catalogue)` }
}

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForDigiVideo: async () => PUBLISHERS,
  getPublishersForDigiDisplay: async () => PUBLISHERS,
  getPublishersForDigiAudio: async () => PUBLISHERS,
  getPublishersForBvod: async () => PUBLISHERS,
  getVideoSites: fetchSites("video"),
  getDisplaySites: fetchSites("display"),
  getAudioSites: fetchSites("audio"),
  getBVODSites: fetchSites("bvod"),
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
    // FB-6 No Ad Serving; a stale calculatedValue; no end date; bursts as a
    // string; a platform that is not the publisher.
    L(4, {
      platform: "Legacy platform",
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
  catalogue: string
  Component: ComponentType<any>
  feeProp: string
  cardLabel: string
  lines: (budget?: string) => any[]
}

const CHANNELS: Channel[] = [
  {
    name: "digitalVideo",
    catalogue: "video",
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
    catalogue: "display",
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
          // W5d: a blank buy type, a blank site, a numeric budget and buy
          // amount (Display's own parser), and a line with no line id.
          { buy_type: "", bursts: [burst("$500.00", "$5.00", "2026-01-12", "2026-01-25")] },
          { site: "", bursts: [burst("$700.00", "$7.00", "2026-01-12", "2026-01-25")] },
          { bursts: [burst(5000, 10, "2026-01-12", "2026-02-08")] },
          {
            line_item_id: null,
            line_item: null,
            bursts: [burst("$900.00", "$9.00", "2026-02-02", "2026-02-15")],
          },
        ],
        budget,
      ),
  },
  {
    name: "digitalAudio",
    catalogue: "audio",
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
    catalogue: "bvod",
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
          // W5d: a blank buy type; a blank site with a station, and one
          // without (station, then publisher); snake-case burst keys; a line
          // with no line id.
          { buy_type: "", bursts: [burst("$500.00", "$5.00", "2026-01-12", "2026-01-25")] },
          {
            site: "",
            station: "Station S",
            bursts: [burst("$700.00", "$7.00", "2026-01-12", "2026-01-25")],
          },
          { site: "", bursts: [burst("$600.00", "$6.00", "2026-01-12", "2026-01-25")] },
          {
            bursts: [
              { budget: "$1,500.00", rate: "$15.00", start_date: "2026-01-12", end_date: "2026-02-08" },
              { budget: "$800.00", buy_amount: "$8.00", start_date: "2026-02-09", end_date: "2026-02-22" },
            ],
          },
          {
            line_item_id: null,
            line_item: null,
            bursts: [burst("$900.00", "$9.00", "2026-02-02", "2026-02-15")],
          },
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

/** Each card's summary row: Publisher, Buy Type, Site and Bursts cells. */
function summaryRows(): string[] {
  return [...document.querySelectorAll("span.font-medium")]
    .filter((s) => s.textContent?.trim() === "Publisher:")
    .map((s) => (s.parentElement?.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim())
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
    wrongCatalogue.length = 0
    ownCatalogue = channel.catalogue
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

    // 4c. W5d (review V2): clear the bonus quantity. The input writes "",
    //     which billing and save carry as they find it.
    act(() => setInput(bonus!, ""))
    await settle()
    out.bonusCleared = snapshot(rec)

    // 4d. W5d: type "1" as the bonus quantity (a string), change the line to
    //     Fixed Cost on its expanded card (the card field rewrites the string
    //     as a number), collapse it, then tick fee-inclusive. A fixed cost
    //     burst on a zero budget recalculates to 0 on a raw channel and to 1
    //     on a rounded one. The string compare itself is pinned in
    //     sharedChannelContainer.roundedCompare.test.tsx (review F5).
    act(() => setInput(bonus!, "1"))
    await settle()
    act(() => controlForLabel("Buy Type", 1).click())
    await settle(50)
    pickOption("Fixed Cost")
    await settle()
    out.bonusToFixedCost = snapshot(rec)
    act(() => byLabel(`Collapse details for ${channel.cardLabel} line item 5`)[0].click())
    act(() => controlForLabel("Budget Includes Fees", 4).click())
    await settle()
    out.fixedCostFeeInclusive = snapshot(rec)

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

    // 7. Add Site from line 4 (a platform that is not its publisher): the
    //    dialog takes the line's publisher, creates the site and writes the
    //    publisher, platform and created site to the line.
    expand(4)
    const siteItem = itemForLabel("Site", 1)
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
    // W5d (review F3): where the dialog has a publisher pick, take Pub B.
    const picker = dialog!.querySelector('[role="combobox"]') as HTMLElement | null
    if (picker) {
      act(() => picker.click())
      await settle(50)
      pickOption("Pub B")
      await settle(50)
    }
    act(() => setInput(nameInput, "Site New"))
    act(() => buttons("Add Site")[0].click())
    await settle()
    out.addSiteCreated = canonical(created)
    out.addSite = snapshot(rec)
    // W5d (review F4): the card summary cells, read here where every line's
    // publisher and platform agree, and line 4's site list, refreshed after Add.
    out.summary = summaryRows()
    // Focus goes back to the Add Site button a tick after the dialog closes
    // (W5d, review F1); let it land before the next popover opens.
    await settle(50)
    act(() => controlForLabel("Site", 1).click())
    await settle(50)
    out.siteOptionsAfterAdd = openOptions()
    act(() => controlForLabel("Site", 1).click())
    await settle(50)

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

    // 10b. W5d: on the duplicated line (a cpm line; new cards are expanded)
    //      type a budget and buy amount whose deliverables are not whole
    //      (C-333 on the rounded channels), so step 11 shows what Apply does
    //      to an expanded card.
    const copy = (rec.media ?? []).length - 2
    typeAndBlur(`input[name$=".${copy}.bursts.0.budget"]`, "$1,000.00")
    typeAndBlur(`input[name$=".${copy}.bursts.0.buyAmount"]`, "3")
    await settle()
    out.typedBeforeGrid = snapshot(rec)

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
    // W5d (review F4): the grid's site list for row 1 (Pub B).
    const gridSite = [...grid.querySelectorAll('[role="combobox"]')].find(
      (b) => b.textContent?.trim() === "Site B2",
    ) as HTMLElement | undefined
    expect(gridSite, "grid site cell").toBeTruthy()
    act(() => gridSite!.click())
    await settle(50)
    out.gridSiteOptions = openOptions()
    act(() => gridSite!.click())
    await settle(50)
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

    expect(wrongCatalogue, "another channel's site catalogue").toEqual([])

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
