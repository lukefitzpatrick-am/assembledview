/**
 * W5l golden: Production's saved output, pinned on its own (bespoke)
 * container before the move onto the shared channel container, and unchanged
 * by the move but for one number: the channel total now comes from the shared
 * money path, which rounds each burst to cents, so the float dust of the old
 * sum is gone (28325.309999999998 became 28325.31; the same $28,325.31 on
 * screen). Everything else is byte-identical (C-383).
 *
 * Records what the container hands the plan page: the save payload
 * (onMediaLineItemsChange) and the persisted bursts it becomes
 * (extractAndFormatBursts), the billing input (onBurstsChange), the Excel rows
 * (onLineItemsChange), the monthly investment, the header total and line
 * count. Key order is kept as each callback gave it (no sort). Production has
 * no raw-lines callback and no Budget field: a burst is Cost and Quantity.
 *
 * Hydrate covers Production's own load shape: bursts under `bursts` and under
 * `bursts_json` (array and JSON string), a burst with the dual-written
 * standard keys and one with cost and amount only, a string cost, a string
 * quantity, a quantity from `deliverables`, a burst with no dates and one with
 * snake dates, a line with no bursts, a unit rate from `attrs.unitRate`
 * (number, string and blank), a unit rate from `unitCost` and `unit_cost`, a
 * unit rate derived from the first burst's cost, a production type from
 * `platform` and from `media_type`, a publisher from `network`, a description
 * from `creative`, a null buy type (C-91), a line with no line id and a line
 * saved in the raw form shape. Then it drives the card (typed cost and
 * quantity, a typed unit rate copied to every burst, the Production type and
 * Publisher lists, burst Duplicate, Add and Remove), a reload, line Remove,
 * Duplicate and Add, an untouched and an edited expert Apply, create, a line
 * id gap and Apply then Remove.
 *
 * Regenerate only for an intended behaviour change:
 *   UPDATE_GOLDEN=1 npx vitest run components/media-containers/__tests__/productionContainer.golden.test.tsx
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
  getPublishersForProduction: async () => [
    { id: 1, publisher_name: "Soundhouse" },
    { id: 2, publisher_name: "The Editors" },
    { id: 3, publisher_name: "Rumble Studios" },
  ],
}))

const { default: ProductionContainer } = await import(
  "@/components/media-containers/ProductionContainer"
)

const GOLDEN = resolve(
  process.cwd(),
  "components/media-containers/__tests__/fixtures/productionContainer.golden.json",
)
// Not midnight on purpose: a line with no bursts takes its burst from these.
const CAMPAIGN_START = new Date(2026, 0, 5, 9, 15)
const CAMPAIGN_END = new Date(2026, 2, 31, 15, 30)
const NOW = new Date("2026-02-10T03:04:05.678Z")
const MEDIA_TYPES = [
  { value: "Television", label: "Television" },
  { value: "Radio", label: "Radio" },
  { value: "Digital Display", label: "Digital Display" },
]

type Recorded = {
  media: any[] | null
  excel: any[] | null
  billing: any[] | null
  investment: any[] | null
  totals: [number, number] | null
}

function burst(cost: unknown, amount: unknown, start?: string, end?: string, extra: Record<string, unknown> = {}) {
  const b: Record<string, unknown> = { cost, amount }
  if (start !== undefined) b.startDate = start
  if (end !== undefined) b.endDate = end
  return { ...b, ...extra }
}

function apiLine(n: number, extra: Record<string, unknown>) {
  return {
    id: 7000 + n,
    line_item_id: `tst001PROD${n}`,
    line_item: n,
    media_type: "Television",
    publisher: "Soundhouse",
    description: `production line ${n}`,
    market: "Melbourne",
    buy_type: null,
    ...extra,
  }
}

function productionLines(firstCost: unknown = 2500) {
  return [
    // Two bursts with the dual-written standard keys, as save writes them.
    apiLine(1, {
      attrs: { unitRate: 2500 },
      bursts: [
        burst(firstCost, 2, "2026-01-12", "2026-02-15", {
          budget: "5000",
          buyAmount: "2",
          calculatedValue: 2,
          description: "production line 1",
          market: "Melbourne",
        }),
        burst(1500, 1, "2026-02-16", "2026-03-15", {
          budget: "1500",
          buyAmount: "1",
          calculatedValue: 1,
        }),
      ],
    }),
    // Cost and amount only (the older save shape), unit rate as a string.
    apiLine(2, {
      attrs: { unitRate: "900" },
      bursts: [burst(900, 3, "2026-01-19", "2026-02-08")],
    }),
    // A string cost and a string quantity: both parse.
    apiLine(3, {
      attrs: { unitRate: "" },
      bursts: [burst("$1,250.50", "4", "2026-02-02", "2026-02-22")],
    }),
    // No unit rate saved: it derives from the first burst's cost.
    apiLine(4, { bursts: [burst(640, 5, "2026-01-05", "2026-01-31")] }),
    // Quantity from `deliverables`, as an older row carried it.
    apiLine(5, { bursts: [burst(300, undefined, "2026-01-12", "2026-01-25", { deliverables: 7 })] }),
    // A burst with no dates at all: the campaign window fills them.
    apiLine(6, { bursts: [burst(400, 1)] }),
    // Snake-case burst dates.
    apiLine(7, { bursts: [{ cost: 150, amount: 8, start_date: "2026-03-02", end_date: "2026-03-29" }] }),
    // No bursts: hydrate gives one in the campaign window.
    apiLine(8, { bursts: [] }),
    // Bursts as a JSON string under bursts_json.
    apiLine(9, {
      bursts: undefined,
      bursts_json: JSON.stringify([burst(275, 2, "2026-02-09", "2026-03-08")]),
    }),
    // Bursts as an array under bursts_json.
    apiLine(10, {
      bursts: undefined,
      bursts_json: [burst(125, 6, "2026-01-12", "2026-02-08")],
    }),
    // Production type from `platform`, publisher from `network`, description
    // from `creative`.
    apiLine(11, {
      media_type: undefined,
      platform: "Radio",
      publisher: undefined,
      network: "The Editors",
      description: undefined,
      creative: "radio tag re-voice",
      bursts: [burst(80, 10, "2026-01-12", "2026-01-25")],
    }),
    // A unit rate under `unitCost`, and a zero-cost burst.
    apiLine(12, { unitCost: 55, bursts: [burst(0, 4, "2026-02-02", "2026-02-15")] }),
    // A unit rate under `unit_cost`, and a zero-quantity burst.
    apiLine(13, { unit_cost: "70", bursts: [burst(70, 0, "2026-02-02", "2026-02-15")] }),
    // No line id and no line number: hydrate mints one.
    apiLine(14, {
      line_item_id: null,
      line_item: null,
      bursts: [burst(210, 3, "2026-01-12", "2026-01-25")],
    }),
    // A line saved in the raw form shape: camel keys and a react key.
    apiLine(15, {
      media_type: undefined,
      mediaType: "Digital Display",
      description: undefined,
      lineItem: 15,
      unitRate: 330,
      bursts: [
        burst(330, 2, "2026-01-12", "2026-01-25", { _reactKey: "old", description: "banner build" }),
      ],
    }),
  ]
}

function strip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, v) => (key === "_reactKey" ? undefined : v)))
}

function headerLineCount(): string | null {
  const span = [...document.querySelectorAll("span")].find((s) =>
    /^\d+ line items?$/.test(s.textContent?.trim() ?? ""),
  )
  return span?.textContent?.trim() ?? null
}

function snapshot(rec: Recorded) {
  const media = rec.media ?? []
  return strip({
    media,
    persistedBursts: media.map((li) => extractAndFormatBursts(li)),
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
  [...document.querySelectorAll('[role="dialog"]')].some((d) =>
    /Expert Mode$/.test(d.querySelector("h2")?.textContent?.trim() ?? ""),
  )

describe("Production container golden (W5l)", () => {
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
        <ProductionContainer
          clientId="client-1"
          {...callbacks}
          campaignStartDate={CAMPAIGN_START}
          campaignEndDate={CAMPAIGN_END}
          campaignBudget={100000}
          campaignId=""
          mediaTypes={MEDIA_TYPES}
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
    const toggle = byLabel(`Expand details for production line item ${lineNumber}`)[0]
    expect(toggle, `expand ${lineNumber}`).toBeTruthy()
    act(() => toggle.click())
  }

  function ensureExpanded(lineNumber: number) {
    if (byLabel(`Expand details for production line item ${lineNumber}`).length > 0) expand(lineNumber)
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

  it("pins hydrate, card edits, the Production type and Publisher lists, reloads, remove, duplicate, expert Apply, create, a line id gap and Apply then Remove", async () => {
    const out: Record<string, unknown> = {}

    // 1. Edit hydrate across Production's load shapes.
    mount(productionLines())
    await settle()
    out.hydrate = snapshot(rec)
    const n = (rec.media ?? []).length
    expect(n).toBe(15)
    out.hydrateGridOpen = gridOpen()

    // 2. Expand line 1; type a cost and a quantity on burst 2.
    expand(1)
    typeAndBlur('input[name$=".0.bursts.1.cost"]', "$1,777.77")
    typeAndBlur('input[name$=".0.bursts.1.amount"]', "3")
    await settle()
    out.typed = snapshot(rec)

    // 3. A typed unit rate writes every burst's cost on that line.
    typeAndBlur('input[name$=".0.unitRate"]', "$2,250.25")
    await settle()
    out.typedUnitRate = snapshot(rec)

    // 4. Burst edits on line 1: Duplicate, Add, then Remove the typed burst.
    act(() => burstAction(1, 0).click())
    await settle()
    act(() => burstAction(0, 0).click())
    await settle()
    act(() => burstAction(2, 1).click())
    await settle()
    out.burstEdits = snapshot(rec)

    // 5. Line 1's Publisher list is the production publishers; its Production
    //    type list is the page's media types.
    out.publisherOptions = await listAndPick("Publisher", 0, "Rumble Studios")
    out.publisherPicked = snapshot(rec)
    out.productionTypeOptions = await listAndPick("Production type", 0, "Radio")
    out.productionTypePicked = snapshot(rec)

    // 6. The same lines again as a new array with only the first cost changed.
    mount(productionLines(2750))
    await settle()
    out.reload = snapshot(rec)

    // 7. Remove line 3.
    const remove = buttons("Remove")
    expect(remove.length).toBe(n)
    act(() => remove[2].click())
    await settle()
    out.removeLine = snapshot(rec)

    // 8. Duplicate line 2, then Add a line.
    act(() => buttons("Duplicate")[1].click())
    await settle()
    const add = buttons("Add Line Item")
    expect(add.length).toBe(1)
    act(() => add[0].click())
    await settle()
    out.duplicateAndAdd = snapshot(rec)

    // 8b. Type cost and quantity on the duplicated line.
    const copy = (rec.media ?? []).length - 2
    ensureExpanded(copy + 1)
    typeAndBlur(`input[name$=".${copy}.bursts.0.cost"]`, "$1,000.00")
    typeAndBlur(`input[name$=".${copy}.bursts.0.amount"]`, "3")
    await settle()
    out.typedBeforeGrid = snapshot(rec)

    // 9. Expert grid: edit row 2's description, then Apply.
    act(() => buttons("Schedule grid")[0].click())
    await settle(100)
    const grid = document.querySelector('[role="dialog"]') as HTMLElement
    expect(grid, "expert dialog").toBeTruthy()
    const cell = [...grid.querySelectorAll("input, textarea")].find(
      (i) => (i as HTMLInputElement).value === "production line 2",
    ) as HTMLInputElement | undefined
    expect(cell, "expert description cell").toBeTruthy()
    act(() => setInput(cell!, "production line 2 edited"))
    await settle(50)
    act(() => buttons("Apply to plan (not saved yet)")[0].click())
    await settle()
    out.expertApply = snapshot(rec)

    // 10. Create: empty channel, the placeholder Add, then a typed cost and quantity.
    remount()
    mount([])
    await settle()
    act(() => buttons("Add line item")[0].click())
    await settle()
    ensureExpanded(1)
    typeAndBlur('input[name$=".0.bursts.0.cost"]', "4321")
    typeAndBlur('input[name$=".0.bursts.0.amount"]', "2")
    await settle()
    out.create = snapshot(rec)

    // 11. A plan with a gap in its line ids (1, 2, 4), then Remove line 1.
    remount()
    const all = productionLines()
    mount([0, 1, 3].map((i, position) => ({ ...all[i], line_item: position })))
    await settle()
    out.lineIdGap = snapshot(rec)
    const ids = (nums: number[]) => nums.map((k) => `tst001PROD${k}`)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(ids([1, 2, 4]))
    expect([...new Set(rec.excel!.map((r) => r.line_item_id))]).toEqual(ids([1, 2, 4]))
    act(() => buttons("Remove")[0].click())
    await settle()
    out.lineIdGapRemove = snapshot(rec)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(ids([2, 4]))

    // 12. Expert Apply with no edit, then Remove line 1: lines number from the cards.
    remount()
    mount(productionLines())
    await settle()
    act(() => buttons("Schedule grid")[0].click())
    await settle(100)
    act(() => buttons("Apply to plan (not saved yet)")[0].click())
    await settle()
    out.applyNoEdit = snapshot(rec)
    act(() => buttons("Remove")[0].click())
    await settle()
    out.applyThenRemove = snapshot(rec)
    expect([...new Set(rec.excel!.map((r) => r.line_item))]).toEqual(
      Array.from({ length: n - 1 }, (_, i) => i + 1),
    )

    const text = `${JSON.stringify(out, null, 2)}\n`
    if (process.env.UPDATE_GOLDEN === "1") writeFileSync(GOLDEN, text)
    expect(text).toBe(readFileSync(GOLDEN, "utf8"))
  }, 240_000)
})
