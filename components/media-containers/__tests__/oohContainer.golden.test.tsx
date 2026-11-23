/**
 * W5k golden: OOH's saved output, pinned on its own (bespoke) container
 * before the move onto the shared channel container.
 *
 * Records what the container hands the plan page: the save payload
 * (onMediaLineItemsChange) and the persisted bursts it becomes
 * (extractAndFormatBursts), the billing input (onBurstsChange), the Excel rows
 * (onLineItemsChange), the monthly investment, the header totals and line
 * count. Key order is kept as each callback gave it (no sort). OOH has no
 * raw-lines callback.
 *
 * Hydrate covers every OOH buy type (panels, cpm, fixed cost, package,
 * package inclusions, bonus), a null, a blank and an unresolved buy type,
 * fee-inclusive and client-pays lines, a saved burst fee and a null one, a
 * stale numeric and a text calculatedValue, bursts as a JSON string, a
 * burst-level buy type, snake-case burst dates, a numeric and a blank burst
 * money value, No Ad Serving (camel, C-36), a line with no bursts, one with
 * no line id, a repeated line id, OOH's own load fallbacks (network from
 * environment or publisher, type from environment, placement from location,
 * every descriptor from `attrs` the way live saves them, an unresolved
 * format), a panel-granularity line and a line saved in the raw form shape.
 * Then it drives the card (fee-inclusive collapsed, typed money, burst
 * edits), the Network and Format lists, a reload, Bonus and Package
 * Inclusions buy types, Remove, Duplicate, Add, an edited expert Apply,
 * create, a line id gap, a package budget typed (OOH's card works package out
 * from budget and rate), Apply then Remove, and the large-format gate (over
 * 30 panel lines the grid opens itself and the cards stay hidden).
 *
 * Regenerate only for an intended behaviour change:
 *   UPDATE_GOLDEN=1 npx vitest run components/media-containers/__tests__/oohContainer.golden.test.tsx
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

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForOoh: async () => [
    { id: 1, publisher_name: "JCDecaux" },
    { id: 2, publisher_name: "oOh!media" },
    { id: 3, publisher_name: "QMS" },
  ],
}))

const { default: OOHContainer } = await import("@/components/media-containers/OOHContainer")

const GOLDEN = resolve(process.cwd(), "components/media-containers/__tests__/fixtures/oohContainer.golden.json")
const FEE = 12.5
// Not midnight on purpose: a line with no bursts takes its burst from these.
const CAMPAIGN_START = new Date(2026, 0, 5, 9, 15)
const CAMPAIGN_END = new Date(2026, 2, 31, 15, 30)
const NOW = new Date("2026-02-10T03:04:05.678Z")

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
    id: 9000 + n,
    line_item_id: `tst001OH${n}`,
    line_item: n,
    network: "JCDecaux",
    format: "large_format",
    type: "Billboard",
    size: "48 sheet",
    placement: `placement ${n}`,
    buy_type: "panels",
    buying_demo: "P25-54",
    market: "Melbourne",
    fixed_cost_media: false,
    client_pays_for_media: false,
    budget_includes_fees: false,
    no_adserving: false,
    ...extra,
  }
}

function oohLines(budget = "$5,000.00") {
  return [
    apiLine(1, {
      bursts: [
        burst(budget, "$2,500.00", "2026-01-12", "2026-02-15", { calculatedValue: 2, fee: 625 }),
        burst("3000", "1500", "2026-02-16", "2026-03-15", { calculatedValue: 2, fee: null }),
      ],
    }),
    // Fee-inclusive cpm whose count is not whole.
    apiLine(2, {
      buy_type: "cpm",
      budget_includes_fees: true,
      bursts: [burst("$7,777.00", "$6.50", "2026-02-09", "2026-03-08")],
    }),
    // Null buy type, client pays; network from environment, type from
    // environment, placement from location.
    apiLine(3, {
      buy_type: null,
      network: null,
      type: null,
      environment: "Roadside",
      publisher: "oOh!media",
      placement: null,
      location: "Bourke St",
      client_pays_for_media: true,
      bursts: [burst("$1,000.00", "$20.00", "2026-01-12", "2026-02-08")],
    }),
    // Bonus: No Ad Serving saved, bursts as a string.
    apiLine(4, {
      buy_type: "bonus",
      no_adserving: true,
      bursts: JSON.stringify([burst("0", "0", "2026-03-02", "2026-03-29", { calculatedValue: 3 })]),
    }),
    // cpm with a stale numeric calculatedValue: OOH keeps it on load.
    apiLine(5, {
      buy_type: "cpm",
      bursts: [burst("$2,000.00", "$40.00", "2026-02-02", "2026-02-22", { calculatedValue: 99999 })],
    }),
    apiLine(6, {
      buy_type: "fixed_cost",
      fixed_cost_media: true,
      bursts: [burst("$4,000.00", "$4,000.00", "2026-01-05", "2026-01-31", { calculatedValue: 1 })],
    }),
    // Package with a text count.
    apiLine(7, {
      buy_type: "package",
      bursts: [burst("$12,000.00", "$1,000.00", "2026-01-05", "2026-01-31", { calculatedValue: "8" })],
    }),
    // Package inclusions with a burst-level bonus type (an older Apply stamped it).
    apiLine(8, {
      buy_type: "package_inclusions",
      bursts: [burst("0", "0", "2026-02-02", "2026-02-22", { calculatedValue: 3, buyType: "bonus" })],
    }),
    apiLine(9, { buy_type: "", bursts: [burst("$500.00", "$50.00", "2026-01-12", "2026-01-25")] }),
    apiLine(10, { buy_type: "fixed_cost", bursts: [] }),
    // No line id: hydrate mints one.
    apiLine(11, { line_item_id: null, line_item: null, bursts: [burst("$900.00", "$300.00", "2026-02-02", "2026-02-15")] }),
    // Every descriptor only in attrs, as live saves them; a raw-shaped attrs.
    apiLine(12, {
      network: null,
      format: null,
      type: null,
      size: null,
      placement: null,
      attrs: {
        network: "QMS",
        format: "street_furniture",
        type: "Shelter",
        size: "6 sheet",
        placement: "attrs placement",
        totalMedia: 700,
        line_item: 12,
        lineItem: 12,
      },
      bursts: [burst("700", "70", "2026-01-12", "2026-01-25", { calculatedValue: 10 })],
    }),
    // Unresolved format and buy type, and a publisher format name.
    apiLine(13, {
      format: "Digital Spectacular",
      buy_type: "weekly flat",
      publisher_format_name: "Spectacular XL",
      bursts: [burst("$1,500.00", "$30.00", "2026-01-12", "2026-01-25", { calculatedValue: 50 })],
    }),
    // Two bursts: a numeric budget, then a blank one with a blank rate.
    apiLine(14, {
      bursts: [
        burst(800, 80, "2026-01-12", "2026-01-25", { calculatedValue: 10 }),
        burst("", "", "2026-02-02", "2026-02-15", { calculatedValue: 0 }),
      ],
    }),
    // A repeat of line 5's id: kept.
    apiLine(15, { id: 9099, line_item_id: "tst001OH5", buy_type: "cpm", bursts: [burst("$1.00", "$1.00", "2026-01-12", "2026-01-25")] }),
    // Snake-case burst dates.
    apiLine(16, { bursts: [{ budget: "$600.00", buyAmount: "$300.00", start_date: "2026-02-02", end_date: "2026-02-15", calculatedValue: 2 }] }),
    // A panel-granularity line (one, under the large-format limit).
    apiLine(17, { attrs: { buy_granularity: "panel" }, bursts: [burst("$450.00", "$450.00", "2026-01-12", "2026-01-25", { calculatedValue: 1 })] }),
    // Bonus with a blank budget and a text count.
    apiLine(18, { buy_type: "bonus", bursts: [burst("", "", "2026-01-12", "2026-01-25", { calculatedValue: "6" })] }),
    // A line saved in the raw form shape: camel keys only.
    apiLine(19, {
      buy_type: undefined,
      buyType: "package",
      budget_includes_fees: undefined,
      budgetIncludesFees: false,
      buyingDemo: "P18+",
      buying_demo: undefined,
      lineItem: 19,
      totalMedia: 999,
      bursts: [burst("$1,500.00", "$30.00", "2026-01-12", "2026-01-25", { calculatedValue: 50, _reactKey: "old" })],
    }),
  ]
}

/** Over the 30-line limit: every line is panel-granularity. */
function largeFormatLines() {
  return Array.from({ length: 31 }, (_, i) =>
    apiLine(i + 1, {
      attrs: { buy_granularity: "panel" },
      bursts: [burst("$100.00", "$100.00", "2026-01-12", "2026-01-25", { calculatedValue: 1 })],
    }),
  )
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

const optionTexts = () => [...document.querySelectorAll("[cmdk-item]")].map((o) => o.textContent?.trim() ?? "")

function pickOption(label: string) {
  const option = [...document.querySelectorAll("[cmdk-item]")].find((o) => o.textContent?.trim() === label) as
    | HTMLElement
    | undefined
  expect(option, `option ${label}`).toBeTruthy()
  act(() => option!.click())
}

const gridOpen = () =>
  [...document.querySelectorAll('[role="dialog"]')].some((d) => /Expert Mode$/.test(d.querySelector("h2")?.textContent?.trim() ?? ""))

describe("OOH container golden (W5k)", () => {
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
        <OOHContainer
          clientId="client-1"
          feeooh={FEE}
          {...callbacks}
          campaignStartDate={CAMPAIGN_START}
          campaignEndDate={CAMPAIGN_END}
          campaignBudget={100000}
          campaignId=""
          mediaTypes={["ooh"]}
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
    const toggle = byLabel(`Expand details for ooh line item ${lineNumber}`)[0]
    expect(toggle, `expand ${lineNumber}`).toBeTruthy()
    act(() => toggle.click())
  }

  function ensureExpanded(lineNumber: number) {
    if (byLabel(`Expand details for ooh line item ${lineNumber}`).length > 0) expand(lineNumber)
  }

  /** Open the `nth` expanded card's `field` list, read it, and pick `pick`. */
  async function listAndPick(field: string, nth: number, pick: string): Promise<string[]> {
    act(() => controlForLabel(field, nth).click())
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

  let offsetHeight: { mockRestore: () => void } | null = null

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
    window.sessionStorage.clear()
    resetWeekStartsOnStore()
    rec = fresh()
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    // The schedule grid virtualises rows: give it a height.
    offsetHeight = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "THEAD" ? 40 : 2000
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    offsetHeight?.mockRestore()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("pins hydrate, card edits, the Network and Format lists, reloads, buy types, remove, duplicate, expert Apply, create, a line id gap and the large-format gate", async () => {
    const out: Record<string, unknown> = {}

    // 1. Edit hydrate across every buy type and OOH load fallback.
    mount(oohLines())
    await settle()
    out.hydrate = snapshot(rec)
    const n = (rec.media ?? []).length
    expect(n).toBe(19)
    out.hydrateGridOpen = gridOpen()

    // 2. Fee-inclusive ticked on line 1 while its card is collapsed.
    act(() => controlForLabel("Budget Includes Fees", 0).click())
    await settle()
    out.feeInclusiveCollapsed = snapshot(rec)

    // 3. Expand line 1; type a budget and a rate on burst 2: the count follows.
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

    // 5. Line 1's Network list is the OOH publishers; pick one. Its Format list is OOH's.
    out.networkOptions = await listAndPick("Network", 0, "QMS")
    out.networkPicked = snapshot(rec)
    out.formatOptions = await listAndPick("Format", 0, "Transit")
    out.formatPicked = snapshot(rec)

    // 6. The same lines again as a new array with only a budget changed.
    mount(oohLines("$9,999.00"))
    await settle()
    out.reload = snapshot(rec)

    // 7. Line 1 buy type to Bonus, line 2 to Package Inclusions (both zero the money).
    ensureExpanded(1)
    await pickBuyType(0, "Bonus")
    out.buyTypeToBonus = snapshot(rec)
    ensureExpanded(2)
    await pickBuyType(1, "Package Inclusions")
    out.buyTypeToPackageInclusions = snapshot(rec)

    // 8. Remove line 3.
    const remove = buttons("Remove")
    expect(remove.length).toBe(n)
    act(() => remove[2].click())
    await settle()
    out.removeLine = snapshot(rec)

    // 9. Duplicate line 2, then Add a line.
    act(() => buttons("Duplicate")[1].click())
    await settle()
    const add = buttons("Add Line Item")
    expect(add.length).toBe(1)
    act(() => add[0].click())
    await settle()
    out.duplicateAndAdd = snapshot(rec)

    // 9b. Type money on the duplicated line.
    const copy = (rec.media ?? []).length - 2
    ensureExpanded(copy + 1)
    typeAndBlur(`input[name$=".${copy}.bursts.0.budget"]`, "$1,000.00")
    typeAndBlur(`input[name$=".${copy}.bursts.0.buyAmount"]`, "3")
    await settle()
    out.typedBeforeGrid = snapshot(rec)

    // 10. Expert grid: edit row 2's placement, then Apply.
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
    await settle()
    out.expertApply = snapshot(rec)

    // 11. Create: empty channel, the placeholder Add, then a typed budget.
    remount()
    mount([])
    await settle()
    act(() => buttons("Add line item")[0].click())
    await settle()
    ensureExpanded(1)
    typeAndBlur('input[name$=".0.bursts.0.budget"]', "4321")
    await settle()
    out.create = snapshot(rec)

    // 12. A plan with a gap in its line ids (1, 2, 4), then Remove line 1.
    remount()
    const all = oohLines()
    mount([0, 1, 3].map((i, position) => ({ ...all[i], line_item: position })))
    await settle()
    out.lineIdGap = snapshot(rec)
    const ids = (nums: number[]) => nums.map((k) => `tst001OH${k}`)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(ids([1, 2, 4]))
    expect([...new Set(rec.excel!.map((r) => r.line_item_id))]).toEqual(ids([1, 2, 4]))
    act(() => buttons("Remove")[0].click())
    await settle()
    out.lineIdGapRemove = snapshot(rec)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(ids([2, 4]))

    // 13. A package budget typed on the card: OOH works the count out from budget and rate.
    remount()
    mount(oohLines())
    await settle()
    expand(7)
    typeAndBlur('input[name$=".6.bursts.0.budget"]', "$6,000.00")
    await settle()
    out.cardPackage = snapshot(rec)

    // 14. Expert Apply with no edit, then Remove line 1: lines number from the cards.
    act(() => buttons("Schedule grid")[0].click())
    await settle(100)
    act(() => buttons("Apply to plan (not saved yet)")[0].click())
    await settle()
    act(() => buttons("Remove")[0].click())
    await settle()
    out.applyThenRemove = snapshot(rec)
    expect([...new Set(rec.excel!.map((r) => r.line_item))]).toEqual(Array.from({ length: n - 1 }, (_, i) => i + 1))

    // 15. Create a cpm line and type a budget before any rate.
    remount()
    mount([])
    await settle()
    act(() => buttons("Add line item")[0].click())
    await settle()
    ensureExpanded(1)
    await pickBuyType(0, "CPM")
    typeAndBlur('input[name$=".0.bursts.0.budget"]', "4321")
    await settle()
    out.createCpmBlankRate = snapshot(rec)

    // 16. Large format: 31 panel lines open the grid on load and hide the cards.
    remount()
    mount(largeFormatLines())
    await settle()
    out.largeFormat = snapshot(rec)
    out.largeFormatGridOpen = gridOpen()
    act(() => buttons("Card entry")[0].click())
    await settle()
    out.largeFormatAfterClose = {
      gridOpen: gridOpen(),
      cards: byLabel("Expand details for ooh line item 1").length,
      openExpertView: buttons("Open expert view").length,
    }

    const text = `${JSON.stringify(out, null, 2)}\n`
    if (process.env.UPDATE_GOLDEN === "1") writeFileSync(GOLDEN, text)
    expect(text).toBe(readFileSync(GOLDEN, "utf8"))
  }, 240_000)
})
