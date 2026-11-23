/**
 * W5j golden: Magazines' saved output, pinned on its own (bespoke)
 * container before the move onto the shared channel container.
 *
 * Records what the container hands the plan page: the save payload
 * (onMediaLineItemsChange) and the persisted bursts it becomes
 * (extractAndFormatBursts), the billing input (onBurstsChange), the Excel rows
 * (onLineItemsChange), the monthly investment, the header totals and line
 * count. Key order is kept as each callback gave it (no sort). Magazines has
 * no raw-lines callback.
 *
 * Hydrate covers every Magazines buy type (insertions, cpm, fixed cost,
 * package, package inclusions, bonus), a null and a blank buy type,
 * fee-inclusive and client-pays lines, a saved burst fee and a null one, a
 * burst with no dates, a stale and a text calculatedValue, bursts as a JSON
 * string, No Ad Serving, a line with no bursts, one with no line id, a
 * repeated line id, a network read from `publisher`, a publisher read from
 * `network`, a title from `publication`, and a line saved in the raw form
 * shape (camel keys). Then it drives the card (fee-inclusive collapsed, typed
 * money, burst edits), the title catalogue (network-filtered, Add Title with
 * and without a network), the ad size catalogue (Add Ad Size, a pick), a
 * reload, Bonus and Package Inclusions buy types, Remove, Duplicate, Add, an
 * edited expert Apply, create, a line id gap, a package budget typed, Apply
 * then Remove and an insertions budget typed before any rate.
 *
 * The catalogues hold what live holds (SELECT, 23 Nov 2026): no blank title,
 * no blank ad size, no padded name, and no publisher id on a title row.
 *
 * Regenerate only for an intended behaviour change:
 *   UPDATE_GOLDEN=1 npx vitest run components/media-containers/__tests__/magazinesContainer.golden.test.tsx
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
  titles: [] as Array<{ id: number; title: string; network: string }>,
  adSizes: [] as Array<{ id: number; adsize: string }>,
  created: [] as unknown[],
}))

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForMagazines: async () => [
    { id: 1, publisher_name: "Are Media" },
    { id: 2, publisher_name: "Nine" },
    { id: 3, publisher_name: "ACM" },
  ],
  getMagazines: async () => db.titles.map((t) => ({ ...t })),
  createMagazine: async (data: { title: string; network: string }) => {
    db.created.push(data)
    const row = { id: 100 + db.titles.length, ...data }
    db.titles.push(row)
    return { ...row }
  },
  getMagazinesAdSizes: async () => db.adSizes.map((a) => ({ ...a })),
  createMagazineAdSize: async (data: { adsize: string }) => {
    db.created.push(data)
    const row = { id: 200 + db.adSizes.length, ...data }
    db.adSizes.push(row)
    return { ...row }
  },
}))

const { default: MagazinesContainer } = await import("@/components/media-containers/MagazinesContainer")

const GOLDEN = resolve(process.cwd(), "components/media-containers/__tests__/fixtures/magazinesContainer.golden.json")
const FEE = 12.5
// Not midnight on purpose: a burst with no saved date falls back from these.
const CAMPAIGN_START = new Date(2026, 0, 5, 9, 15)
const CAMPAIGN_END = new Date(2026, 2, 31, 15, 30)
const NOW = new Date("2026-02-10T03:04:05.678Z")
const TITLES = [
  { id: 1, title: "Womens Weekly", network: "Are Media" },
  { id: 2, title: "Gourmet Traveller", network: "Are Media" },
  { id: 3, title: "Good Weekend", network: "Nine" },
  { id: 4, title: "", network: "Nine" },
  { id: 5, title: "Country Style", network: "ACM" },
]
const AD_SIZES = [
  { id: 1, adsize: "Full Page" },
  { id: 2, adsize: "Half Page" },
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
    id: 9000 + n,
    line_item_id: `tst001MG${n}`,
    line_item: n,
    network: "Are Media",
    publisher: "Are Media",
    title: "Womens Weekly",
    size: "Full Page",
    format: "Colour",
    placement: `placement ${n}`,
    buy_type: "insertions",
    buying_demo: "P25-54",
    market: "Melbourne",
    fixed_cost_media: false,
    client_pays_for_media: false,
    budget_includes_fees: false,
    no_adserving: false,
    ...extra,
  }
}

function mgLines(budget = "$5,000.00") {
  return [
    apiLine(1, {
      bursts: [
        burst(budget, "$2,500.00", "2026-01-12", "2026-02-15", { calculatedValue: 2, fee: 625 }),
        burst("3000", "1500", "2026-02-16", "2026-03-15", { calculatedValue: 2, fee: null }),
      ],
    }),
    // Fee-inclusive insertions whose count is not whole.
    apiLine(2, {
      budget_includes_fees: true,
      bursts: [burst("$7,777.00", "$650.00", "2026-02-09", "2026-03-08")],
    }),
    // Null buy type, client pays, network only as publisher, title only as publication, no dates.
    apiLine(3, {
      buy_type: null,
      network: null,
      publisher: "Nine",
      title: null,
      publication: "Good Weekend",
      client_pays_for_media: true,
      bursts: [burst("$1,000.00", "$20.00")],
    }),
    // Bonus: No Ad Serving saved, bursts as a string.
    apiLine(4, {
      buy_type: "bonus",
      no_adserving: true,
      bursts: JSON.stringify([burst("0", "0", "2026-03-02", "2026-03-29", { calculatedValue: 3 })]),
    }),
    // cpm with a stale calculatedValue; publisher only as network.
    apiLine(5, {
      buy_type: "cpm",
      publisher: null,
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
    apiLine(8, {
      buy_type: "package_inclusions",
      bursts: [burst("0", "0", "2026-02-02", "2026-02-22", { calculatedValue: 3 })],
    }),
    apiLine(9, { buy_type: "", bursts: [burst("$500.00", "$50.00", "2026-01-12", "2026-01-25")] }),
    apiLine(10, { buy_type: "fixed_cost", bursts: [] }),
    // No line id: hydrate mints one.
    apiLine(11, { line_item_id: null, line_item: null, bursts: [burst("$900.00", "$300.00", "2026-02-02", "2026-02-15")] }),
    // No network, no publisher, no title, no size.
    apiLine(12, {
      network: null,
      publisher: null,
      title: null,
      size: null,
      bursts: [burst("$700.00", "$70.00", "2026-01-12", "2026-01-25")],
    }),
    // A line saved in the raw form shape: camel keys only.
    apiLine(13, {
      buy_type: undefined,
      buyType: "package",
      budget_includes_fees: undefined,
      budgetIncludesFees: false,
      lineItem: 13,
      totalMedia: 999,
      bursts: [burst("$1,500.00", "$30.00", "2026-01-12", "2026-01-25", { calculatedValue: 50, _reactKey: "old" })],
    }),
    // Two bursts, the first with no dates.
    apiLine(14, { bursts: [burst("$800.00", "$80.00"), burst("$400.00", "$80.00", "2026-02-02", "2026-02-15")] }),
    // A repeat of line 5's id: kept.
    apiLine(15, { id: 9099, line_item_id: "tst001MG5", buy_type: "cpm", bursts: [burst("$1.00", "$1.00", "2026-01-12", "2026-01-25")] }),
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

/** The add button beside a card field (`nth` expanded card). */
function addButton(field: string, nth: number): HTMLButtonElement {
  const button = [...itemForLabel(field, nth).querySelectorAll("button")].find(
    (b) => b.getAttribute("role") !== "combobox",
  ) as HTMLButtonElement | undefined
  expect(button, `add ${field} #${nth}`).toBeTruthy()
  return button!
}

function fieldByLabel(scope: HTMLElement, text: RegExp): HTMLInputElement {
  const label = [...scope.querySelectorAll("label")].find((l) => text.test(l.textContent?.trim() ?? ""))
  const input = label ? (document.getElementById(label.htmlFor) as HTMLInputElement | null) : null
  expect(input, `field ${text}`).toBeTruthy()
  return input!
}

/** The Add dialog for `kind` ("Title" or "Ad Size"), whatever noun its heading carries. */
const dialogTitled = (kind: string) =>
  [...document.querySelectorAll('[role="dialog"]')].find((d) =>
    new RegExp(`^Add New \\w+ ${kind}$`).test(d.querySelector("h2")?.textContent?.trim() ?? ""),
  ) as HTMLElement | undefined

describe("Magazines container golden (W5j)", () => {
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
        <MagazinesContainer
          clientId="client-1"
          feemagazines={FEE}
          {...callbacks}
          campaignStartDate={CAMPAIGN_START}
          campaignEndDate={CAMPAIGN_END}
          campaignBudget={100000}
          campaignId=""
          mediaTypes={["magazines"]}
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
    const toggle = byLabel(`Expand details for magazines line item ${lineNumber}`)[0]
    expect(toggle, `expand ${lineNumber}`).toBeTruthy()
    act(() => toggle.click())
  }

  function ensureExpanded(lineNumber: number) {
    if (byLabel(`Expand details for magazines line item ${lineNumber}`).length > 0) expand(lineNumber)
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
    db.titles = TITLES.map((t) => ({ ...t }))
    db.adSizes = AD_SIZES.map((a) => ({ ...a }))
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

  it("pins hydrate, card edits, the title and ad size catalogues, reloads, buy types, remove, duplicate, expert Apply, create and a line id gap", async () => {
    const out: Record<string, unknown> = {}

    // 1. Edit hydrate across every buy type.
    mount(mgLines())
    await settle()
    out.hydrate = snapshot(rec)
    const n = (rec.media ?? []).length
    expect(n).toBe(15)

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

    // 5. Line 1's Title list is the catalogue's Are Media titles; pick one.
    out.titleOptionsAreMedia = await listAndPick("Title", 0, "Gourmet Traveller")
    out.titlePicked = snapshot(rec)

    // 6. Line 1's Ad Size list is the whole catalogue; pick one.
    out.adSizeOptions = await listAndPick("Ad Size", 0, "Half Page")
    out.adSizePicked = snapshot(rec)

    // 7. Add Title on line 12 (no network): a prompt, no dialog.
    expand(12)
    act(() => addButton("Title", 1).click())
    await settle(50)
    out.addTitleNoNetwork = dialogTitled("Title") ? "dialog" : "no dialog"

    // 8. Add Title on line 1: pick another network in the dialog and type a
    //    name. The title is created, the list is read again, and the line
    //    takes the created network and title.
    act(() => addButton("Title", 0).click())
    await settle(50)
    const dialog = dialogTitled("Title")
    expect(dialog, "add title dialog").toBeTruthy()
    act(() => (dialog!.querySelector('[role="combobox"]') as HTMLElement).click())
    await settle(50)
    pickOption("Nine")
    await settle(50)
    act(() => setInput(fieldByLabel(dialog!, /^title name$/i), "The New Mag"))
    act(() => [...dialog!.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add Title")!.click())
    await settle()
    out.addTitleDialogClosed = dialogTitled("Title") ? "open" : "closed"
    await settle()
    out.addTitle = snapshot(rec)
    out.titleOptionsNine = await listAndPick("Title", 0, "The New Mag")

    // 9. Add Ad Size on line 12 (no network needed): created and set on the line.
    act(() => addButton("Ad Size", 1).click())
    await settle(50)
    const sizeDialog = dialogTitled("Ad Size")
    expect(sizeDialog, "add ad size dialog").toBeTruthy()
    act(() => setInput(fieldByLabel(sizeDialog!, /^ad size$/i), "DPS"))
    act(() => [...sizeDialog!.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add Ad Size")!.click())
    await settle()
    // The old container left this dialog open (it closed the Title dialog); not pinned, so close it.
    const stillOpen = dialogTitled("Ad Size")
    if (stillOpen) act(() => [...stillOpen.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Cancel")!.click())
    await settle(50)
    out.created = db.created
    await settle()
    out.addAdSize = snapshot(rec)
    out.adSizeOptionsAfterAdd = await listAndPick("Ad Size", 1, "DPS")

    // 10. The same lines again as a new array with only a budget changed.
    mount(mgLines("$9,999.00"))
    await settle()
    out.reload = snapshot(rec)

    // 11. Line 1 buy type to Bonus, line 2 to Package Inclusions (both zero the money).
    ensureExpanded(1)
    await pickBuyType(0, "Bonus")
    out.buyTypeToBonus = snapshot(rec)
    ensureExpanded(2)
    await pickBuyType(1, "Package Inclusions")
    out.buyTypeToPackageInclusions = snapshot(rec)

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
    ensureExpanded(copy + 1)
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
    ensureExpanded(1)
    typeAndBlur('input[name$=".0.bursts.0.budget"]', "4321")
    await settle()
    out.create = snapshot(rec)

    // 16. A plan with a gap in its line ids (1, 2, 4), then Remove line 1.
    remount()
    const all = mgLines()
    mount([0, 1, 3].map((i, position) => ({ ...all[i], line_item: position })))
    await settle()
    out.lineIdGap = snapshot(rec)
    const ids = (nums: number[]) => nums.map((k) => `tst001MG${k}`)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(ids([1, 2, 4]))
    expect([...new Set(rec.excel!.map((r) => r.line_item_id))]).toEqual(ids([1, 2, 4]))
    act(() => buttons("Remove")[0].click())
    await settle()
    out.lineIdGapRemove = snapshot(rec)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(ids([2, 4]))

    // 17. A package budget typed on the card: the count stays.
    remount()
    mount(mgLines())
    await settle()
    expand(7)
    typeAndBlur('input[name$=".6.bursts.0.budget"]', "$6,000.00")
    await settle()
    out.cardPackage = snapshot(rec)

    // 18. Expert Apply with no edit, then Remove line 1: lines number from the cards.
    act(() => buttons("Schedule grid")[0].click())
    await settle(100)
    act(() => buttons("Apply to plan (not saved yet)")[0].click())
    await settle()
    act(() => buttons("Remove")[0].click())
    await settle()
    out.applyThenRemove = snapshot(rec)
    expect([...new Set(rec.excel!.map((r) => r.line_item))]).toEqual(Array.from({ length: n - 1 }, (_, i) => i + 1))

    // 19. Create an insertions line and type a budget before any rate.
    remount()
    mount([])
    await settle()
    act(() => buttons("Add line item")[0].click())
    await settle()
    ensureExpanded(1)
    await pickBuyType(0, "Insertions")
    typeAndBlur('input[name$=".0.bursts.0.budget"]', "4321")
    await settle()
    out.createInsertionsBlankRate = snapshot(rec)

    const text = `${JSON.stringify(out, null, 2)}\n`
    if (process.env.UPDATE_GOLDEN === "1") writeFileSync(GOLDEN, text)
    expect(text).toBe(readFileSync(GOLDEN, "utf8"))
  }, 180_000)
})
