/**
 * W5e golden: Cinema's saved output, pinned on its own (bespoke) container
 * before any move onto the shared channel container.
 *
 * Records what the container hands the plan page:
 * - the save payload (onMediaLineItemsChange) and the persisted bursts it
 *   becomes (extractAndFormatBursts, the bursts_json write contract)
 * - the billing schedule input (onBurstsChange)
 * - the Excel rows (onLineItemsChange): Cinema's own columns (network,
 *   station, placement, format as creative, duration) and line ids
 * - the monthly investment, the header totals and the header line count
 *
 * Key order is canonical (keys sorted): the save payload is jsonb and every
 * reader takes fields by name.
 *
 * Hydrate covers every live Cinema buy type (bonus, spots, null) and the
 * rest Cinema offers (cpm, fixed cost, package, package inclusions, blank),
 * fee-inclusive and client-pays lines, a saved burst fee, a burst with no
 * dates (falls back to now: Date is pinned), a stale calculatedValue, bursts
 * saved as a JSON string, No Ad Serving (FB-6), a line saved with no bursts
 * and one with no line id. Then it drives: fee-inclusive ticked on a
 * collapsed card, rounded deliverables typed on an expanded card and a burst
 * duplicated on an expanded card (C-333), Add / Remove burst, a typed bonus
 * quantity, Add Station (and its prompt on a line with no network), a reload
 * with a changed budget, a buy type change to Bonus, Remove line, Duplicate
 * and Add line, a non-whole burst typed on an expanded card then an edited
 * expert grid Apply (C-333: Cinema collapses its cards on Apply), the create
 * path, and a plan with a gap in its line ids. W5f adds the card's own
 * deliverable rule (a package budget typed; a spots budget typed before any
 * cost per spot) and an expert Apply followed by a Remove (line numbers from
 * the cards).
 *
 * Not covered: a numeric burst budget. The old container's save and billing
 * call `budget.replace` and throw on one (live 0).
 *
 * Regenerate only for an intended behaviour change:
 *   UPDATE_GOLDEN=1 npx vitest run components/media-containers/__tests__/cinemaContainer.golden.test.tsx
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

const GOLDEN = resolve(
  process.cwd(),
  "components/media-containers/__tests__/fixtures/cinemaContainer.golden.json",
)
const FEE = 12.5
// Not midnight on purpose: a burst with no saved date falls back from these.
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

function apiLine(n: number, extra: Record<string, unknown>) {
  return {
    id: 7000 + n,
    line_item_id: `tst001CN${n}`,
    line_item: n,
    network: "Hoyts",
    station: `Station ${n}`,
    placement: `placement ${n}`,
    format: `format ${n}`,
    duration: "30s",
    bid_strategy: "",
    buy_type: "spots",
    buying_demo: "P18+",
    market: "National",
    fixed_cost_media: false,
    client_pays_for_media: false,
    budget_includes_fees: false,
    no_adserving: false,
    ...extra,
  }
}

function cinemaLines(budget = "$5,000.00") {
  return [
    // Spots, two bursts, a saved fee on burst 1.
    apiLine(1, {
      bursts: [
        burst(budget, "$500.00", "2026-01-12", "2026-02-15", { fee: 625 }),
        burst("3000", "250", "2026-02-16", "2026-03-15"),
      ],
    }),
    // Fee-inclusive spots whose count is not whole (rounded).
    apiLine(2, {
      budget_includes_fees: true,
      bursts: [burst("$7,777.00", "$650.00", "2026-02-09", "2026-03-08")],
    }),
    // Null buy type (live), client pays, no network, no dates at all.
    apiLine(3, {
      buy_type: null,
      network: null,
      client_pays_for_media: true,
      bursts: [burst("$1,000.00", "$20.00")],
    }),
    // Bonus (live): FB-6 No Ad Serving, quantity saved, bursts as a string.
    apiLine(4, {
      buy_type: "bonus",
      no_adserving: true,
      bursts: JSON.stringify([burst("0", "0", "2026-03-02", "2026-03-29", { calculatedValue: 500 })]),
    }),
    // Spots with a stale calculatedValue: hydrate recomputes.
    apiLine(5, {
      bursts: [burst("$2,000.00", "$400.00", "2026-02-02", "2026-02-22", { calculatedValue: 99999 })],
    }),
    // cpm whose impressions are not whole.
    apiLine(6, {
      buy_type: "cpm",
      bursts: [burst("$10,000.00", "$12.00", "2026-01-19", "2026-02-22")],
    }),
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
    // A blank buy type.
    apiLine(10, { buy_type: "", bursts: [burst("$500.00", "$50.00", "2026-01-12", "2026-01-25")] }),
    // Saved with no bursts.
    apiLine(11, { buy_type: "fixed_cost", bursts: [] }),
    // No line id: hydrate mints one.
    apiLine(12, {
      line_item_id: null,
      line_item: null,
      bursts: [burst("$900.00", "$300.00", "2026-02-02", "2026-02-15")],
    }),
  ]
}

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

function pickOption(label: string) {
  const option = [...document.querySelectorAll("[cmdk-item]")].find(
    (o) => o.textContent?.trim() === label,
  ) as HTMLElement | undefined
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

/** The input a dialog label names (`for` points at it). */
function fieldByLabel(scope: HTMLElement, text: RegExp): HTMLInputElement {
  const label = [...scope.querySelectorAll("label")].find((l) => text.test(l.textContent?.trim() ?? ""))
  const input = label ? (document.getElementById(label.htmlFor) as HTMLInputElement | null) : null
  expect(input, `field ${text}`).toBeTruthy()
  return input!
}

const stationDialog = () =>
  [...document.querySelectorAll('[role="dialog"]')].find((d) =>
    (d.textContent ?? "").includes("Add New Cinema Station"),
  ) as HTMLElement | undefined

describe("Cinema container golden (W5e)", () => {
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
    act(() => {
      root.render(
        <CinemaContainer
          clientId="client-1"
          feecinema={FEE}
          {...callbacks}
          campaignStartDate={CAMPAIGN_START}
          campaignEndDate={CAMPAIGN_END}
          campaignBudget={100000}
          campaignId=""
          mediaTypes={["cinema"]}
          initialLineItems={initialLineItems}
        />,
      )
    })
  }

  function expand(lineNumber: number) {
    const toggle = byLabel(`Expand details for cinema line item ${lineNumber}`)[0]
    expect(toggle, `expand ${lineNumber}`).toBeTruthy()
    act(() => toggle.click())
  }

  function ensureExpanded(lineNumber: number) {
    if (byLabel(`Expand details for cinema line item ${lineNumber}`).length > 0) {
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

  it("pins hydrate, card edits, Add Station, reload, buy type, remove, duplicate, expert Apply, create and a line id gap", async () => {
    const out: Record<string, unknown> = {}

    // 1. Edit hydrate across every buy type.
    mount(cinemaLines())
    await settle()
    out.hydrate = snapshot(rec)
    const n = (rec.media ?? []).length

    // 2. Fee-inclusive ticked on line 1 while its card is collapsed: only the
    //    container recomputes deliverables (no card field is mounted).
    act(() => controlForLabel("Budget Includes Fees", 0).click())
    await settle()
    out.feeInclusiveCollapsed = snapshot(rec)

    // 3. Expand line 1 and type a budget and a cost per spot on burst 2 whose
    //    spots are not whole (C-333: the blur rounds last).
    expand(1)
    typeAndBlur('input[name$=".0.bursts.1.budget"]', "$7,777.7")
    typeAndBlur('input[name$=".0.bursts.1.buyAmount"]', "3.3")
    await settle()
    out.typed = snapshot(rec)

    // 4. Burst edits on line 1: Duplicate (copies the typed burst; the copy's
    //    field writes its raw value, C-333), Add, then Remove the typed burst.
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

    // 6. Add Station on line 3 (no network): a prompt, no dialog.
    expand(3)
    act(() => addStationButton(1).click())
    await settle(50)
    out.addStationNoNetwork = stationDialog() ? "dialog" : "no dialog"

    // 7. Add Station on line 1: the dialog takes the line's network, and Add
    //    writes the network and the new station to the line.
    act(() => addStationButton(0).click())
    await settle(50)
    const dialog = stationDialog()
    expect(dialog, "add station dialog").toBeTruthy()
    const name = fieldByLabel(dialog!, /^station name$/i)
    act(() => setInput(name, "Station New"))
    act(() => buttons("Add Station")[0].click())
    await settle()
    out.addStationDialogClosed = stationDialog() ? "open" : "closed"
    out.addStation = snapshot(rec)

    // 8. The page passes the same lines again as a new array, line 1's first
    //    budget changed.
    mount(cinemaLines("$9,999.00"))
    await settle()
    out.reload = snapshot(rec)

    // 9. Line 1 buy type changed to Bonus (bonus zeroes budget and buy amount).
    ensureExpanded(1)
    act(() => controlForLabel("Buy Type", 0).click())
    await settle(50)
    pickOption("Bonus")
    await settle()
    out.buyTypeToBonus = snapshot(rec)

    // 10. Remove line 3.
    const remove = buttons("Remove")
    expect(remove.length).toBe(n)
    act(() => remove[2].click())
    await settle()
    out.removeLine = snapshot(rec)

    // 11. Duplicate line 2, then Add a line.
    act(() => buttons("Duplicate")[1].click())
    await settle()
    const add = buttons("Add Line Item")
    expect(add.length).toBe(1)
    act(() => add[0].click())
    await settle()
    out.duplicateAndAdd = snapshot(rec)

    // 11b. On the duplicated line (spots, a new card is expanded) type a budget
    //      and cost per spot whose spots are not whole, so step 12 shows what
    //      Apply does to an expanded card (C-333).
    const copy = (rec.media ?? []).length - 2
    typeAndBlur(`input[name$=".${copy}.bursts.0.budget"]`, "$1,000.00")
    typeAndBlur(`input[name$=".${copy}.bursts.0.buyAmount"]`, "3")
    await settle()
    out.typedBeforeGrid = snapshot(rec)

    // 12. Expert grid: edit row 2's placement, then Apply. jsdom has no
    //     layout, so give the grid's scroller a height or the virtualiser
    //     mounts no rows.
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
    const apply = buttons("Apply to plan (not saved yet)")
    expect(apply.length).toBe(1)
    act(() => apply[0].click())
    offsetHeight.mockRestore()
    await settle()
    out.expertApply = snapshot(rec)

    act(() => root.unmount())
    root = createRoot(host)
    rec = fresh()

    // 13. Create: empty channel, the placeholder Add, then a typed budget.
    mount([])
    await settle()
    const placeholderAdd = buttons("Add line item")
    expect(placeholderAdd.length).toBe(1)
    act(() => placeholderAdd[0].click())
    await settle()
    typeAndBlur('input[name$=".0.bursts.0.budget"]', "4321")
    await settle()
    out.create = snapshot(rec)

    // 14. A plan with a gap in its line ids (1, 2, 4), read back with
    //     `line_item` as the saved position, as Postgres gives it. Save and
    //     Excel keep 1, 2, 4. Then Remove line 1.
    act(() => root.unmount())
    root = createRoot(host)
    rec = fresh()
    const all = cinemaLines()
    mount([0, 1, 3].map((i, position) => ({ ...all[i], line_item: position })))
    await settle()
    out.lineIdGap = snapshot(rec)
    const ids = (nums: number[]) => nums.map((k) => `tst001CN${k}`)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(ids([1, 2, 4]))
    expect([...new Set(rec.excel!.map((r) => r.line_item_id))]).toEqual(ids([1, 2, 4]))
    act(() => buttons("Remove")[0].click())
    await settle()
    out.lineIdGapRemove = snapshot(rec)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(ids([2, 4]))
    expect([...new Set(rec.excel!.map((r) => r.line_item_id))]).toEqual(ids([2, 4]))

    // 15. The card's own package rule (W5f, C-341 item 3): Cinema works a
    //     package line's deliverables out from budget and rate on the card.
    act(() => root.unmount())
    root = createRoot(host)
    rec = fresh()
    mount(cinemaLines())
    await settle()
    expand(8)
    typeAndBlur('input[name$=".7.bursts.0.budget"]', "$6,000.00")
    await settle()
    out.cardPackage = snapshot(rec)

    // 16. Expert Apply with no edit, then Remove line 1: the summary and the
    //     Excel rows number lines from the cards, not the `position` Apply
    //     stamps (C-362; kills W5e's CN18).
    act(() => buttons("Schedule grid")[0].click())
    await settle(100)
    act(() => buttons("Apply to plan (not saved yet)")[0].click())
    await settle()
    act(() => buttons("Remove")[0].click())
    await settle()
    out.applyThenRemove = snapshot(rec)
    expect([...new Set(rec.excel!.map((r) => r.line_item))]).toEqual(
      Array.from({ length: n - 1 }, (_, i) => i + 1),
    )

    // 17. Create a spots line and type a budget before any cost per spot:
    //     Cinema reads the blank buy amount as 0 (W5f, C-341 item 3).
    act(() => root.unmount())
    root = createRoot(host)
    rec = fresh()
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
    if (process.env.UPDATE_GOLDEN === "1") {
      writeFileSync(GOLDEN, text)
    }
    expect(text).toBe(readFileSync(GOLDEN, "utf8"))
  }, 90_000)
})
