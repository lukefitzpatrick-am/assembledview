/**
 * W5h golden: Television's saved output, pinned on its own (bespoke)
 * container before the move onto the shared channel container.
 *
 * Records what the container hands the plan page: the save payload
 * (onMediaLineItemsChange) and the persisted bursts it becomes
 * (extractAndFormatBursts), the raw form lines (onTelevisionLineItemsChange:
 * edit passes them to the same handler as the save rows, so they are saved
 * too, C-377), the billing input (onBurstsChange), the Excel rows
 * (onLineItemsChange), the monthly investment, the header totals and line
 * count. Key order is kept as each callback gave it (no sort).
 *
 * Hydrate covers every Television buy type (cpt, cpp, spots, cpm, fixed cost,
 * package, package inclusions, bonus), a null and a blank buy type,
 * fee-inclusive and client-pays lines, a saved burst fee, a burst with no
 * dates, size or TARPs, a stale calculatedValue, bursts as a JSON string, No
 * Ad Serving (Television bills false), a line with no bursts, one with no line
 * id, a repeated line id, a network read from `platform` or `publisher`, a
 * station from `site` or `publisher`, creative from `creativeLength`, a line
 * saved in the raw form shape (camel keys, line TARPs and size), and line
 * TARPs summed from the bursts. Then it drives the card (fee-inclusive
 * collapsed, typed money and the TARPs it works out, burst edits, a bonus
 * quantity, Ad Size copied to every burst), the station catalogue, a reload
 * with the same load key (skipped) and a changed one, Bonus and Package
 * Inclusions buy types, Remove, Duplicate, Add, an edited expert Apply,
 * create, a line id gap, a package budget typed, Apply then Remove and a cpt
 * budget typed before any rate.
 *
 * Regenerate only for an intended behaviour change:
 *   UPDATE_GOLDEN=1 npx vitest run components/media-containers/__tests__/televisionContainer.golden.test.tsx
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
import { MP_BURST_ACTION_COLUMN } from "@/lib/mediaplan/burstSectionLayout"
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
  getPublishersForTelevision: async () => [
    { id: 1, publisher_name: "Seven" },
    { id: 2, publisher_name: "Nine" },
    { id: 3, publisher_name: "Ten" },
  ],
  getTVStations: async () => db.stations.map((s) => ({ ...s })),
  createTVStation: async (data: { station: string; network: string }) => {
    db.created.push(data)
    const row = { id: 100 + db.stations.length, ...data }
    db.stations.push(row)
    return { ...row }
  },
}))

const { default: TelevisionContainer } = await import("@/components/media-containers/TelevisionContainer")

const GOLDEN = resolve(process.cwd(), "components/media-containers/__tests__/fixtures/televisionContainer.golden.json")
const FEE = 12.5
// Not midnight on purpose: a burst with no saved date falls back from these.
const CAMPAIGN_START = new Date(2026, 0, 5, 9, 15)
const CAMPAIGN_END = new Date(2026, 2, 31, 15, 30)
const NOW = new Date("2026-02-10T03:04:05.678Z")
const STATIONS = [
  { id: 1, station: "7", network: "Seven" },
  { id: 2, station: "7mate", network: "Seven" },
  { id: 3, station: "9", network: "Nine" },
  { id: 4, station: "", network: "Nine" },
  { id: 5, station: "10", network: "Ten" },
]

type Recorded = {
  media: any[] | null
  raw: any[] | null
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
    id: 8000 + n,
    line_item_id: `tst001TV${n}`,
    line_item: n,
    network: "Seven",
    station: "7",
    daypart: "Prime",
    placement: `placement ${n}`,
    creative: "30s TVC",
    bid_strategy: "",
    buy_type: "cpt",
    buying_demo: "P25-54",
    market: "Melbourne",
    fixed_cost_media: false,
    client_pays_for_media: false,
    budget_includes_fees: false,
    no_adserving: false,
    ...extra,
  }
}

function tvLines(budget = "$50,000.00", placement1 = "placement 1") {
  return [
    apiLine(1, {
      placement: placement1,
      bursts: [
        burst(budget, "$500.00", "2026-01-12", "2026-02-15", { size: "30s", tarps: "100", calculatedValue: 100, fee: 6250 }),
        burst("30000", "250", "2026-02-16", "2026-03-15", { size: "30s", tarps: "120", calculatedValue: 120 }),
      ],
    }),
    // Fee-inclusive cpp whose TARPs are not whole.
    apiLine(2, {
      buy_type: "cpp",
      budget_includes_fees: true,
      bursts: [burst("$7,777.00", "$650.00", "2026-02-09", "2026-03-08", { size: "15s", tarps: "10.47" })],
    }),
    // Null buy type, client pays, network only as platform, station only as site, no dates.
    apiLine(3, {
      buy_type: null,
      network: null,
      platform: "Nine",
      station: null,
      site: "9Go",
      client_pays_for_media: true,
      bursts: [burst("$1,000.00", "$20.00", undefined, undefined, { size: "30s", tarps: "50" })],
    }),
    // Bonus: No Ad Serving saved (Television bills false), TARPs saved, bursts as a string.
    apiLine(4, {
      buy_type: "bonus",
      no_adserving: true,
      bursts: JSON.stringify([burst("0", "0", "2026-03-02", "2026-03-29", { size: "30s", tarps: "120" })]),
    }),
    // Spots with a stale calculatedValue.
    apiLine(5, {
      buy_type: "spots",
      bursts: [burst("$2,000.00", "$400.00", "2026-02-02", "2026-02-22", { size: "30s", tarps: "5", calculatedValue: 99999 })],
    }),
    apiLine(6, { buy_type: "cpm", bursts: [burst("$10,000.00", "$12.00", "2026-01-19", "2026-02-22", { size: "6s", tarps: "" })] }),
    apiLine(7, {
      buy_type: "fixed_cost",
      fixed_cost_media: true,
      bursts: [burst("$4,000.00", "$4,000.00", "2026-01-05", "2026-01-31", { size: "30s", tarps: "1" })],
    }),
    apiLine(8, {
      buy_type: "package",
      bursts: [burst("$12,000.00", "$1,000.00", "2026-01-05", "2026-01-31", { size: "30s", tarps: "8", calculatedValue: 8 })],
    }),
    apiLine(9, {
      buy_type: "package_inclusions",
      bursts: [burst("0", "0", "2026-02-02", "2026-02-22", { size: "30s", tarps: "", calculatedValue: 3 })],
    }),
    apiLine(10, { buy_type: "", bursts: [burst("$500.00", "$50.00", "2026-01-12", "2026-01-25", { size: "30s", tarps: "2" })] }),
    apiLine(11, { buy_type: "fixed_cost", bursts: [] }),
    // No line id: hydrate mints one.
    apiLine(12, { line_item_id: null, line_item: null, bursts: [burst("$900.00", "$300.00", "2026-02-02", "2026-02-15", { size: "30s", tarps: "3" })] }),
    // Network only as publisher; station from publisher too.
    apiLine(13, {
      network: null,
      publisher: "Ten",
      station: null,
      bursts: [burst("$600.00", "$60.00", "2026-01-12", "2026-01-25", { size: "30s", tarps: "10" })],
    }),
    // No network at all.
    apiLine(14, { network: null, station: null, bursts: [burst("$700.00", "$70.00", "2026-01-12", "2026-01-25", { size: "30s", tarps: "10" })] }),
    // A line saved in the raw form shape: camel keys, creative only as
    // creativeLength, line TARPs and size of its own.
    apiLine(15, {
      creative: null,
      creativeLength: "15s cut",
      size: "15s",
      tarps: "55",
      lineItem: 15,
      creativeTargeting: "",
      noadserving: false,
      totalMedia: 999,
      bursts: [burst("$1,500.00", "$30.00", "2026-01-12", "2026-01-25", { size: "15s", tarps: "50", calculatedValue: 50, _reactKey: "old" })],
    }),
    // A burst with no size or TARPs and no dates; line TARPs from the bursts.
    apiLine(16, { bursts: [burst("$800.00", "$80.00"), burst("$400.00", "$80.00", "2026-02-02", "2026-02-15", { tarps: "5" })] }),
    // A repeat of line 5's id: Television keeps both.
    apiLine(17, { id: 8099, line_item_id: "tst001TV5", buy_type: "spots", bursts: [burst("$1.00", "$1.00", "2026-01-12", "2026-01-25", { size: "30s", tarps: "1" })] }),
  ]
}

function strip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, v) => (key === "_reactKey" ? undefined : v)))
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
    raw: rec.raw,
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

function setInput(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

function typeAndBlur(selector: string, value: string) {
  const el = document.querySelector(selector) as HTMLInputElement
  expect(el, selector).toBeTruthy()
  act(() => setInput(el, value))
  act(() => el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
}

const inBurstActions = (b: Element) => !!b.closest(`[class="${MP_BURST_ACTION_COLUMN}"]`)

/** Line buttons by text (Remove, Duplicate, Add Line Item), never a burst row's. */
function buttons(text: string): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")].filter(
    (b) => b.textContent?.trim() === text && !inBurstActions(b),
  ) as HTMLButtonElement[]
}

/** A burst row's action button (0 add, 1 duplicate, 2 remove), `nth` burst row on the page. */
function burstAction(action: 0 | 1 | 2, nth: number): HTMLButtonElement {
  const rows = [...document.querySelectorAll(`[class="${MP_BURST_ACTION_COLUMN}"]`)].filter(
    (c) => c.querySelectorAll("button").length === 3,
  )
  const button = rows[nth]?.querySelectorAll("button")[action] as HTMLButtonElement | undefined
  expect(button, `burst action ${action} #${nth}`).toBeTruthy()
  return button!
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

function textForLabel(text: string, nth: number): HTMLInputElement | HTMLTextAreaElement {
  const control = itemForLabel(text, nth).querySelector("input, textarea") as HTMLInputElement | null
  expect(control, `${text} #${nth} text`).toBeTruthy()
  return control!
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
    (d.textContent ?? "").includes("Add New TV Station"),
  ) as HTMLElement | undefined

describe("Television container golden (W5h)", () => {
  let host: HTMLDivElement
  let root: Root
  let rec: Recorded

  const fresh = (): Recorded => ({ media: null, raw: null, excel: null, billing: null, investment: null, totals: null })

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
    onTelevisionLineItemsChange: (i: any[]) => {
      rec.raw = i
    },
    onMediaLineItemsChange: (i: any[]) => {
      rec.media = i
    },
  }

  function mount(initialLineItems: any[]) {
    act(() => {
      root.render(
        <TelevisionContainer
          clientId="client-1"
          feetelevision={FEE}
          {...callbacks}
          campaignStartDate={CAMPAIGN_START}
          campaignEndDate={CAMPAIGN_END}
          campaignBudget={100000}
          campaignId=""
          mediaTypes={["television"]}
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
    const toggle = byLabel(`Expand details for television line item ${lineNumber}`)[0]
    expect(toggle, `expand ${lineNumber}`).toBeTruthy()
    act(() => toggle.click())
  }

  function ensureExpanded(lineNumber: number) {
    if (byLabel(`Expand details for television line item ${lineNumber}`).length > 0) expand(lineNumber)
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

  async function pickBuyType(nth: number, label: string) {
    act(() => controlForLabel("Buy Type", nth).click())
    await settle(50)
    pickOption(label)
    await settle()
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

  it("pins hydrate, card edits, TARPs, the station catalogue, reloads, buy types, remove, duplicate, expert Apply, create and a line id gap", async () => {
    const out: Record<string, unknown> = {}

    // 1. Edit hydrate across every buy type.
    mount(tvLines())
    await settle()
    out.hydrate = snapshot(rec)
    const n = (rec.media ?? []).length
    expect(n).toBe(17)

    // 2. Fee-inclusive ticked on line 1 while its card is collapsed.
    act(() => controlForLabel("Budget Includes Fees", 0).click())
    await settle()
    out.feeInclusiveCollapsed = snapshot(rec)

    // 3. Expand line 1; type a budget and a CPT on burst 2: the TARPs follow.
    expand(1)
    typeAndBlur('input[name$=".0.bursts.1.budget"]', "$7,777.7")
    typeAndBlur('input[name$=".0.bursts.1.buyAmount"]', "3.3")
    await settle()
    out.typed = snapshot(rec)

    // 4. Burst edits on line 1: Duplicate, Add, then Remove the typed burst.
    act(() => burstAction(1, 0).click())
    await settle()
    act(() => burstAction(0, 0).click())
    await settle()
    act(() => burstAction(2, 1).click())
    await settle()
    out.burstEdits = snapshot(rec)

    // 5. Expand line 4 (bonus) and type a quantity: the input writes TARPs.
    expand(4)
    const bonus = [...document.querySelectorAll('input[type="number"]')].find(
      (i) => (i as HTMLInputElement).value === "120",
    ) as HTMLInputElement | undefined
    expect(bonus, "bonus input").toBeTruthy()
    act(() => setInput(bonus!, "250"))
    await settle()
    out.bonusTyped = snapshot(rec)

    // 6. Line 1's Station list is the catalogue's Seven stations; pick one.
    out.stationOptionsSeven = await stationOptions(0, "7mate")
    out.stationPicked = snapshot(rec)

    // 7. Ad Size on line 1 is copied to every burst.
    act(() => setInput(textForLabel("Ad Size", 0), "45s"))
    await settle()
    out.sizeCopied = snapshot(rec)

    // 8. Add Station on line 14 (no network): a prompt, no dialog.
    expand(14)
    act(() => addStationButton(2).click())
    await settle(50)
    out.addStationNoNetwork = stationDialog() ? "dialog" : "no dialog"

    // 9. Add Station on line 1: pick another network in the dialog and type a
    //    name. The station is created, the list is read again, and the line
    //    takes the created network and station.
    act(() => addStationButton(0).click())
    await settle(50)
    const dialog = stationDialog()
    expect(dialog, "add station dialog").toBeTruthy()
    act(() => (dialog!.querySelector('[role="combobox"]') as HTMLElement).click())
    await settle(50)
    pickOption("Nine")
    await settle(50)
    act(() => setInput(fieldByLabel(dialog!, /^station name$/i), "Station New"))
    act(() => [...dialog!.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add Station")!.click())
    await settle()
    out.addStationDialogClosed = stationDialog() ? "open" : "closed"
    out.addStationCreated = db.created
    out.addStation = snapshot(rec)
    out.stationOptionsNine = await stationOptions(0, "Station New")

    // 10. The same lines again as a new array with only a budget changed: the
    //     same load key, so the form keeps its edits.
    mount(tvLines("$99,999.00"))
    await settle()
    out.reloadSameKey = snapshot(rec)

    // 11. A new array whose load key changes (line 1's placement): it hydrates.
    mount(tvLines("$99,999.00", "placement 1 B"))
    await settle()
    out.reload = snapshot(rec)

    // 12. Line 1 buy type to Bonus (budgets zeroed), line 2 to Package
    //     Inclusions (budgets kept).
    ensureExpanded(1)
    await pickBuyType(0, "Bonus")
    out.buyTypeToBonus = snapshot(rec)
    ensureExpanded(2)
    await pickBuyType(1, "Package Inclusions")
    out.buyTypeToPackageInclusions = snapshot(rec)

    // 13. Remove line 3.
    const remove = buttons("Remove")
    expect(remove.length).toBe(n)
    act(() => remove[2].click())
    await settle()
    out.removeLine = snapshot(rec)

    // 14. Duplicate line 2, then Add a line.
    act(() => buttons("Duplicate")[1].click())
    await settle()
    const add = buttons("Add Line Item")
    expect(add.length).toBe(1)
    act(() => add[0].click())
    await settle()
    out.duplicateAndAdd = snapshot(rec)

    // 14b. Type money on the duplicated line.
    const copy = (rec.media ?? []).length - 2
    ensureExpanded(copy + 1)
    typeAndBlur(`input[name$=".${copy}.bursts.0.budget"]`, "$1,000.00")
    typeAndBlur(`input[name$=".${copy}.bursts.0.buyAmount"]`, "3")
    await settle()
    out.typedBeforeGrid = snapshot(rec)

    // 15. Expert grid: edit row 2's placement, then Apply.
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

    // 16. Create: empty channel, the placeholder Add, then a typed budget.
    remount()
    mount([])
    await settle()
    act(() => buttons("Add line item")[0].click())
    await settle()
    ensureExpanded(1)
    typeAndBlur('input[name$=".0.bursts.0.budget"]', "4321")
    await settle()
    out.create = snapshot(rec)

    // 17. A plan with a gap in its line ids (1, 2, 4), then Remove line 1.
    remount()
    const all = tvLines()
    mount([0, 1, 3].map((i, position) => ({ ...all[i], line_item: position })))
    await settle()
    out.lineIdGap = snapshot(rec)
    const ids = (nums: number[]) => nums.map((k) => `tst001TV${k}`)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(ids([1, 2, 4]))
    expect([...new Set(rec.excel!.map((r) => r.line_item_id))]).toEqual(ids([1, 2, 4]))
    act(() => buttons("Remove")[0].click())
    await settle()
    out.lineIdGapRemove = snapshot(rec)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(ids([2, 4]))

    // 18. A package budget typed on the card: the TARPs stay.
    remount()
    mount(tvLines())
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

    // 20. Create a cpt line and type a budget before any rate.
    remount()
    mount([])
    await settle()
    act(() => buttons("Add line item")[0].click())
    await settle()
    ensureExpanded(1)
    await pickBuyType(0, "CPT")
    typeAndBlur('input[name$=".0.bursts.0.budget"]', "4321")
    await settle()
    out.createCptBlankRate = snapshot(rec)

    const text = `${JSON.stringify(out, null, 2)}\n`
    if (process.env.UPDATE_GOLDEN === "1") writeFileSync(GOLDEN, text)
    expect(text).toBe(readFileSync(GOLDEN, "utf8"))
  }, 180_000)
})
