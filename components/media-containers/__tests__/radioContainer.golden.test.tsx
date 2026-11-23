/**
 * W5g golden: Radio's saved output, pinned on its own (bespoke) container
 * before the move onto the shared channel container.
 *
 * Records what the container hands the plan page: the save payload
 * (onMediaLineItemsChange) and the persisted bursts it becomes
 * (extractAndFormatBursts), the billing input (onBurstsChange), the Excel rows
 * (onLineItemsChange), the monthly investment, the header totals and line
 * count. Key order is canonical (keys sorted).
 *
 * Hydrate covers every Radio buy type (spots, bonus, cpm, fixed cost, package,
 * package inclusions), a null and a blank buy type, fee-inclusive and
 * client-pays lines, a saved burst fee, a burst with no dates (campaign day
 * fallback), a stale calculatedValue, bursts as a JSON string, No Ad Serving
 * (FB-6), a line with no bursts, one with no line id, a network read from
 * `platform` or `publisher` and a station from `site`, and the load de-dupe (a
 * repeated line id, and two id-less lines with the same market, network,
 * station, buy type and placement). Then it drives the card (fee-inclusive
 * collapsed, typed money, burst edits, a bonus quantity), the station
 * catalogue (the card's Station options per network, Add Station with no
 * network, Add Station picking another network in the dialog), a reload with
 * the same load key (skipped) and with a changed one, Bonus, Remove,
 * Duplicate, Add, an edited expert Apply, create, the own-publish echo on
 * create, a line id gap, a package budget typed, Apply then Remove and a
 * spots budget typed before any rate.
 *
 * Not covered: a numeric burst budget (the old container throws on one).
 *
 * Regenerate only for an intended behaviour change:
 *   UPDATE_GOLDEN=1 npx vitest run components/media-containers/__tests__/radioContainer.golden.test.tsx
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { extractAndFormatBursts } from "@/lib/mediaplan/formatBurstsForPersist"
import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

const db = vi.hoisted(() => ({
  stations: [] as Array<{ id: number; station: string; network: string }>,
  created: [] as unknown[],
}))

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForRadio: async () => [
    { id: 1, publisher_name: "Nova" },
    { id: 2, publisher_name: "ARN" },
    { id: 3, publisher_name: "SCA" },
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

const GOLDEN = resolve(process.cwd(), "components/media-containers/__tests__/fixtures/radioContainer.golden.json")
const FEE = 12.5
// Not midnight on purpose: a burst with no saved date falls back from these.
const CAMPAIGN_START = new Date(2026, 0, 5, 9, 15)
const CAMPAIGN_END = new Date(2026, 2, 31, 15, 30)
const NOW = new Date("2026-02-10T03:04:05.678Z")
const STATIONS = [
  { id: 1, station: "Nova 100", network: "Nova" },
  { id: 2, station: "smoothfm", network: "Nova" },
  { id: 3, station: "KIIS", network: "ARN" },
  { id: 4, station: "", network: "ARN" },
  { id: 5, station: "Triple M", network: "SCA" },
]

type Recorded = {
  media: any[] | null
  excel: any[] | null
  billing: any[] | null
  investment: any[] | null
  totals: [number, number] | null
}

function burst(budget: unknown, buyAmount: unknown, start?: string, end?: string, extra: Record<string, unknown> = {}) {
  const b: Record<string, unknown> = { budget, buyAmount }
  if (start !== undefined) b.startDate = start
  if (end !== undefined) b.endDate = end
  return { ...b, ...extra }
}

function apiLine(n: number, extra: Record<string, unknown>) {
  return {
    id: 7000 + n,
    line_item_id: `tst001RA${n}`,
    line_item: n,
    network: "Nova",
    station: "Nova 100",
    placement: `placement ${n}`,
    format: `format ${n}`,
    duration: "30s",
    bid_strategy: "",
    buy_type: "spots",
    buying_demo: "P18+",
    market: "Sydney",
    fixed_cost_media: false,
    client_pays_for_media: false,
    budget_includes_fees: false,
    no_adserving: false,
    ...extra,
  }
}

function radioLines(budget = "$5,000.00", station1 = "Nova 100") {
  return [
    apiLine(1, {
      station: station1,
      bursts: [
        burst(budget, "$500.00", "2026-01-12", "2026-02-15", { fee: 625 }),
        burst("3000", "250", "2026-02-16", "2026-03-15"),
      ],
    }),
    // Fee-inclusive spots whose count is not whole.
    apiLine(2, { budget_includes_fees: true, bursts: [burst("$7,777.00", "$650.00", "2026-02-09", "2026-03-08")] }),
    // Null buy type, client pays, network only as platform, station only as site, no dates.
    apiLine(3, {
      buy_type: null,
      network: null,
      platform: "ARN",
      station: null,
      site: "KIIS",
      client_pays_for_media: true,
      bursts: [burst("$1,000.00", "$20.00")],
    }),
    // Bonus: FB-6 No Ad Serving, quantity saved, bursts as a string.
    apiLine(4, {
      buy_type: "bonus",
      no_adserving: true,
      bursts: JSON.stringify([burst("0", "0", "2026-03-02", "2026-03-29", { calculatedValue: 500 })]),
    }),
    // Spots with a stale calculatedValue.
    apiLine(5, { bursts: [burst("$2,000.00", "$400.00", "2026-02-02", "2026-02-22", { calculatedValue: 99999 })] }),
    apiLine(6, { buy_type: "cpm", bursts: [burst("$10,000.00", "$12.00", "2026-01-19", "2026-02-22")] }),
    apiLine(7, {
      buy_type: "fixed_cost",
      fixed_cost_media: true,
      bursts: [burst("$4,000.00", "$4,000.00", "2026-01-05", "2026-01-31")],
    }),
    apiLine(8, {
      buy_type: "package",
      bursts: [burst("$12,000.00", "$1,000.00", "2026-01-05", "2026-01-31", { calculatedValue: 8 })],
    }),
    apiLine(9, {
      buy_type: "package_inclusions",
      bursts: [burst("0", "0", "2026-02-02", "2026-02-22", { calculatedValue: 3 })],
    }),
    apiLine(10, { buy_type: "", bursts: [burst("$500.00", "$50.00", "2026-01-12", "2026-01-25")] }),
    apiLine(11, { buy_type: "fixed_cost", bursts: [] }),
    // No line id: hydrate mints one.
    apiLine(12, { line_item_id: null, line_item: null, bursts: [burst("$900.00", "$300.00", "2026-02-02", "2026-02-15")] }),
    // Network only as publisher.
    apiLine(13, {
      network: null,
      publisher: "SCA",
      station: null,
      bursts: [burst("$600.00", "$60.00", "2026-01-12", "2026-01-25")],
    }),
    // No network at all.
    apiLine(14, { network: null, station: null, bursts: [burst("$700.00", "$70.00", "2026-01-12", "2026-01-25")] }),
    // A repeat of line 5's id: the load de-dupe keeps the first.
    apiLine(15, { id: 7099, line_item_id: "tst001RA5", bursts: [burst("$1.00", "$1.00", "2026-01-12", "2026-01-25")] }),
    // Two lines with no id at all and the same market, network, station, buy
    // type and placement: the second is dropped.
    apiLine(16, {
      id: undefined,
      line_item_id: null,
      line_item: null,
      placement: "fallback",
      bursts: [burst("$800.00", "$80.00", "2026-01-12", "2026-01-25")],
    }),
    apiLine(17, {
      id: undefined,
      line_item_id: null,
      line_item: null,
      placement: "fallback",
      bursts: [burst("$1.00", "$1.00", "2026-01-12", "2026-01-25")],
    }),
  ]
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) out[key] = canonical((value as Record<string, unknown>)[key])
    return out
  }
  return value
}

function strip(value: unknown): unknown {
  return canonical(JSON.parse(JSON.stringify(value, (key, v) => (key === "_reactKey" ? undefined : v))))
}

function headerLineCount(): string | null {
  const span = [...document.querySelectorAll("span")].find((s) => /^\d+ line items?$/.test(s.textContent?.trim() ?? ""))
  return span?.textContent?.trim() ?? null
}

function snapshot(rec: Recorded) {
  const media = rec.media ?? []
  return strip({
    media,
    persistedBursts: media.map((li) => extractAndFormatBursts(li, li.feePct)),
    billing: rec.billing,
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
  return [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === text) as HTMLButtonElement[]
}

function byLabel(label: string): HTMLButtonElement[] {
  return [...document.querySelectorAll(`button[aria-label="${label}"]`)] as HTMLButtonElement[]
}

function itemForLabel(text: string, nth: number): HTMLElement {
  const label = [...document.querySelectorAll("label")].filter((l) => l.textContent?.trim() === text)[nth]
  expect(label, `${text} #${nth}`).toBeTruthy()
  return label.parentElement as HTMLElement
}

function controlForLabel(text: string, nth: number): HTMLElement {
  const control = itemForLabel(text, nth).querySelector('[role="checkbox"], [role="combobox"]') as HTMLElement
  expect(control, `${text} #${nth} control`).toBeTruthy()
  return control
}

const optionTexts = () => [...document.querySelectorAll("[cmdk-item]")].map((o) => o.textContent?.trim() ?? "")

function pickOption(label: string) {
  const option = [...document.querySelectorAll("[cmdk-item]")].find((o) => o.textContent?.trim() === label) as
    | HTMLElement
    | undefined
  expect(option, `option ${label}`).toBeTruthy()
  act(() => option!.click())
}

/** The Add Station button beside a card's Station field (`nth` expanded card). */
function addStationButton(nth: number): HTMLButtonElement {
  const button = [...itemForLabel("Station", nth).querySelectorAll("button")].find(
    (b) => b.getAttribute("role") !== "combobox",
  ) as HTMLButtonElement | undefined
  expect(button, `add station #${nth}`).toBeTruthy()
  return button!
}

function fieldByLabel(scope: HTMLElement, text: RegExp): HTMLInputElement {
  const label = [...scope.querySelectorAll("label")].find((l) => text.test(l.textContent?.trim() ?? ""))
  const input = label ? (document.getElementById(label.htmlFor) as HTMLInputElement | null) : null
  expect(input, `field ${text}`).toBeTruthy()
  return input!
}

const stationDialog = () =>
  [...document.querySelectorAll('[role="dialog"]')].find((d) =>
    (d.textContent ?? "").includes("Add New Radio Station"),
  ) as HTMLElement | undefined

const expandedCards = () => document.querySelectorAll('button[aria-label^="Collapse details for radio"]').length

describe("Radio container golden (W5g)", () => {
  let host: HTMLDivElement
  let root: Root
  let rec: Recorded

  const fresh = (): Recorded => ({ media: null, excel: null, billing: null, investment: null, totals: null })

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
    act(() => {
      root.render(
        <RadioContainer
          clientId="client-1"
          feeradio={FEE}
          {...callbacks}
          campaignStartDate={CAMPAIGN_START}
          campaignEndDate={CAMPAIGN_END}
          campaignBudget={100000}
          campaignId=""
          mediaTypes={["radio"]}
          initialLineItems={initialLineItems}
        />,
      )
    })
  }

  function remount() {
    act(() => root.unmount())
    root = createRoot(host)
    rec = fresh()
  }

  function expand(lineNumber: number) {
    const toggle = byLabel(`Expand details for radio line item ${lineNumber}`)[0]
    expect(toggle, `expand ${lineNumber}`).toBeTruthy()
    act(() => toggle.click())
  }

  function ensureExpanded(lineNumber: number) {
    if (byLabel(`Expand details for radio line item ${lineNumber}`).length > 0) expand(lineNumber)
  }

  /** Open the `nth` expanded card's Station list, read it, and pick `pick`. */
  async function stationOptions(nth: number, pick: string): Promise<string[]> {
    act(() => controlForLabel("Station", nth).click())
    await settle(50)
    const texts = optionTexts()
    pickOption(pick)
    await settle()
    return texts
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
    vi.useFakeTimers({ toFake: ["Date"], now: NOW })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    resetWeekStartsOnStore()
    db.stations = STATIONS.map((s) => ({ ...s }))
    db.created = []
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

  it("pins hydrate, card edits, the station catalogue, reloads, buy type, remove, duplicate, expert Apply, create and its echo, and a line id gap", async () => {
    const out: Record<string, unknown> = {}

    // 1. Edit hydrate across every buy type, with the load de-dupe.
    mount(radioLines())
    await settle()
    out.hydrate = snapshot(rec)
    const n = (rec.media ?? []).length
    expect(n).toBe(15)

    // 2. Fee-inclusive ticked on line 1 while its card is collapsed.
    act(() => controlForLabel("Budget Includes Fees", 0).click())
    await settle()
    out.feeInclusiveCollapsed = snapshot(rec)

    // 3. Expand line 1; type a budget and a cost per spot on burst 2.
    expand(1)
    typeAndBlur('input[name$=".0.bursts.1.budget"]', "$7,777.7")
    typeAndBlur('input[name$=".0.bursts.1.buyAmount"]', "3.3")
    await settle()
    out.typed = snapshot(rec)

    // 4. Burst edits on line 1: Duplicate, Add, then Remove the typed burst.
    act(() => byLabel("Duplicate burst on line 1")[0].click())
    await settle()
    act(() => byLabel("Add burst to line 1")[0].click())
    await settle()
    act(() => byLabel("Remove burst 2 from line 1")[0].click())
    await settle()
    out.burstEdits = snapshot(rec)

    // 5. Expand line 4 (bonus) and type a quantity: the input writes a string.
    expand(4)
    const bonus = [...document.querySelectorAll('input[type="number"]')].find(
      (i) => (i as HTMLInputElement).value === "500",
    ) as HTMLInputElement | undefined
    expect(bonus, "bonus input").toBeTruthy()
    act(() => setInput(bonus!, "250"))
    await settle()
    out.bonusTyped = snapshot(rec)

    // 6. Line 1's Station list is the catalogue's Nova stations; pick one.
    out.stationOptionsNova = await stationOptions(0, "smoothfm")
    out.stationPicked = snapshot(rec)

    // 7. Add Station on line 14 (no network): a prompt, no dialog.
    expand(14)
    act(() => addStationButton(2).click())
    await settle(50)
    out.addStationNoNetwork = stationDialog() ? "dialog" : "no dialog"

    // 8. Add Station on line 1: pick another network in the dialog and type a
    //    name. The station is created in the catalogue, the list is read again,
    //    and the line takes the created network and station.
    act(() => addStationButton(0).click())
    await settle(50)
    const dialog = stationDialog()
    expect(dialog, "add station dialog").toBeTruthy()
    act(() => (dialog!.querySelector('[role="combobox"]') as HTMLElement).click())
    await settle(50)
    pickOption("ARN")
    await settle(50)
    act(() => setInput(fieldByLabel(dialog!, /^station name$/i), "Station New"))
    act(() => buttons("Add Station")[0].click())
    await settle()
    out.addStationDialogClosed = stationDialog() ? "open" : "closed"
    out.addStationCreated = db.created
    out.addStation = snapshot(rec)
    out.stationOptionsArn = await stationOptions(0, "Station New")

    // 9. The page passes the same lines again as a new array with only a
    //    budget changed: the same load key, so Radio keeps the form.
    mount(radioLines("$9,999.00"))
    await settle()
    out.reloadSameKey = snapshot(rec)

    // 10. A new array whose load key changes (line 1's station): it hydrates.
    mount(radioLines("$9,999.00", "Nova 100 B"))
    await settle()
    out.reload = snapshot(rec)

    // 11. Line 1 buy type changed to Bonus.
    ensureExpanded(1)
    act(() => controlForLabel("Buy Type", 0).click())
    await settle(50)
    pickOption("Bonus")
    await settle()
    out.buyTypeToBonus = snapshot(rec)

    // 12. Remove line 3.
    const remove = buttons("Remove")
    expect(remove.length).toBe(n)
    act(() => remove[2].click())
    await settle()
    out.removeLine = snapshot(rec)

    // 13. Duplicate line 2, then Add a line.
    act(() => buttons("Duplicate")[1].click())
    await settle()
    const add = buttons("Add Line Item")
    expect(add.length).toBe(1)
    act(() => add[0].click())
    await settle()
    out.duplicateAndAdd = snapshot(rec)

    // 13b. Type money on the duplicated line.
    const copy = (rec.media ?? []).length - 2
    typeAndBlur(`input[name$=".${copy}.bursts.0.budget"]`, "$1,000.00")
    typeAndBlur(`input[name$=".${copy}.bursts.0.buyAmount"]`, "3")
    await settle()
    out.typedBeforeGrid = snapshot(rec)

    // 14. Expert grid: edit row 2's placement, then Apply.
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.tagName === "THEAD" ? 40 : 2000
      })
    act(() => buttons("Schedule grid")[0].click())
    await settle(100)
    const grid = document.querySelector('[role="dialog"]') as HTMLElement
    expect(grid, "expert dialog").toBeTruthy()
    const cell = [...grid.querySelectorAll("input, textarea")].find(
      (i) => (i as HTMLInputElement).value === "placement 2",
    ) as HTMLInputElement | undefined
    expect(cell, "expert placement cell").toBeTruthy()
    act(() => setInput(cell!, "placement 2 edited"))
    await settle(50)
    act(() => buttons("Apply to plan (not saved yet)")[0].click())
    offsetHeight.mockRestore()
    await settle()
    out.expertApply = snapshot(rec)

    // 15. Create: empty channel, the placeholder Add, then a typed budget.
    remount()
    mount([])
    await settle()
    act(() => buttons("Add line item")[0].click())
    await settle()
    typeAndBlur('input[name$=".0.bursts.0.budget"]', "4321")
    await settle()
    out.create = snapshot(rec)

    // 16. Create echoes the save rows back as `initialLineItems`: the echo is
    //     not loaded (the card stays open); a different array is.
    const echo = rec.media!
    const openBefore = expandedCards()
    mount(echo)
    await settle()
    out.ownPublishEcho = { openBefore, openAfter: expandedCards(), saved: snapshot(rec) }
    mount([...echo])
    await settle()
    out.notEcho = { openAfter: expandedCards(), saved: snapshot(rec) }

    // 17. A plan with a gap in its line ids (1, 2, 4), then Remove line 1.
    remount()
    const all = radioLines()
    mount([0, 1, 3].map((i, position) => ({ ...all[i], line_item: position })))
    await settle()
    out.lineIdGap = snapshot(rec)
    const ids = (nums: number[]) => nums.map((k) => `tst001RA${k}`)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(ids([1, 2, 4]))
    expect([...new Set(rec.excel!.map((r) => r.line_item_id))]).toEqual(ids([1, 2, 4]))
    act(() => buttons("Remove")[0].click())
    await settle()
    out.lineIdGapRemove = snapshot(rec)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(ids([2, 4]))

    // 18. A package budget typed on the card: Radio keeps the quantity.
    remount()
    mount(radioLines())
    await settle()
    expand(8)
    typeAndBlur('input[name$=".7.bursts.0.budget"]', "$6,000.00")
    await settle()
    out.cardPackage = snapshot(rec)

    // 19. Expert Apply with no edit, then Remove line 1: lines number from the cards.
    act(() => buttons("Schedule grid")[0].click())
    await settle(100)
    act(() => buttons("Apply to plan (not saved yet)")[0].click())
    await settle()
    act(() => buttons("Remove")[0].click())
    await settle()
    out.applyThenRemove = snapshot(rec)
    expect([...new Set(rec.excel!.map((r) => r.line_item))]).toEqual(Array.from({ length: n - 1 }, (_, i) => i + 1))

    // 20. Create a spots line and type a budget before any cost per spot.
    remount()
    mount([])
    await settle()
    act(() => buttons("Add line item")[0].click())
    await settle()
    act(() => controlForLabel("Buy Type", 0).click())
    await settle(50)
    pickOption("Spots")
    await settle()
    typeAndBlur('input[name$=".0.bursts.0.budget"]', "4321")
    await settle()
    out.createSpotsBlankRate = snapshot(rec)

    const text = `${JSON.stringify(out, null, 2)}\n`
    if (process.env.UPDATE_GOLDEN === "1") writeFileSync(GOLDEN, text)
    expect(text).toBe(readFileSync(GOLDEN, "utf8"))
  }, 120_000)
})
