/**
 * W5afix goldens: Search and Prog Display on the shared channel container,
 * pinned byte for byte. Same shape as the Social golden (W5a), but these two
 * run the hook's default paths (no `billingBursts`, no `burstDateFallback`,
 * no raw-lines prop), which the other shared channels share.
 *
 * Records what the container hands the plan page:
 * - the save payload (onMediaLineItemsChange) and the persisted bursts it
 *   becomes (extractAndFormatBursts, the bursts_json write contract)
 * - the billing schedule input (onBurstsChange)
 * - the Excel rows (onLineItemsChange)
 * - the monthly investment, the header totals and the raw line count
 *
 * Hydrate covers every buy type live on each channel, fee-inclusive and
 * client-pays lines, a numeric budget, a burst with no dates, a non-bonus
 * burst saved with a stale calculatedValue, and for Prog Display a No Ad
 * Serving line (FB-6) and a burst with ad serving overrides.
 * Then it drives: fee-inclusive toggled on a collapsed card, card typing,
 * Add / Duplicate / Remove burst, a buy type change to bonus, Remove line,
 * Duplicate and Add line, an edited expert grid Apply, and the create path.
 *
 * Regenerate only for an intended behaviour change:
 *   UPDATE_GOLDEN=1 npx vitest run components/media-containers/__tests__/sharedChannelContainers.golden.test.tsx
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, type ComponentType } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { extractAndFormatBursts } from "@/lib/mediaplan/formatBurstsForPersist"
import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForSearch: async () => [
    { id: 1, publisher_name: "Google" },
    { id: 2, publisher_name: "Microsoft" },
  ],
  getPublishersForProgDisplay: async () => [
    { id: 3, publisher_name: "DV360" },
    { id: 4, publisher_name: "The Trade Desk" },
  ],
}))

const { default: SearchContainer } = await import(
  "@/components/media-containers/SearchContainer"
)
const { default: ProgDisplayContainer } = await import(
  "@/components/media-containers/ProgDisplayContainer"
)

const FEE = 12.5
// Not midnight on purpose: a burst with no saved date falls back from these.
const CAMPAIGN_START = new Date(2026, 0, 5, 9, 15)
const CAMPAIGN_END = new Date(2026, 2, 31, 15, 30)

type Recorded = {
  media: any[] | null
  excel: any[] | null
  billing: any[] | null
  investment: any[] | null
  totals: [number, number] | null
  rawCount: number | null
}

function burst(budget: unknown, buyAmount: unknown, start?: string, end?: string, calc?: unknown) {
  const b: Record<string, unknown> = { budget, buyAmount }
  if (start !== undefined) b.startDate = start
  if (end !== undefined) b.endDate = end
  if (calc !== undefined) b.calculatedValue = calc
  return b
}

function lines(code: string, platform: string, bid: string, extraLines: Record<string, unknown>[]) {
  const apiLine = (n: number, extra: Record<string, unknown>) => ({
    line_item_id: `tst001${code}${n}`,
    line_item: n,
    platform,
    bid_strategy: bid,
    buy_type: "cpc",
    creative_targeting: `targeting ${n}`,
    creative: `creative ${n}`,
    buying_demo: "P18+",
    market: "National",
    fixed_cost_media: false,
    client_pays_for_media: false,
    budget_includes_fees: false,
    no_adserving: false,
    ...extra,
  })
  const base = [
    apiLine(1, {
      buy_type: "cpc",
      bursts: [
        burst("$5,000.00", "$1.25", "2026-01-12", "2026-02-15"),
        burst("3000", "2.1", "2026-02-16", "2026-03-15"),
      ],
    }),
    apiLine(2, {
      buy_type: "cpm",
      budget_includes_fees: true,
      bursts: [burst("$12,000.00", "$15.00", "2026-01-05", "2026-01-31")],
    }),
    apiLine(3, {
      buy_type: null,
      client_pays_for_media: true,
      bursts: [burst("$1,000.00", "$20.00")],
    }),
    apiLine(4, {
      buy_type: "",
      bursts: [burst(2500, 10, "2026-03-02", "2026-03-29")],
    }),
    // A non-bonus burst saved with a stale calculatedValue: hydrate recomputes.
    apiLine(5, {
      buy_type: "cpc",
      bursts: [burst("$2,000.00", "$2.00", "2026-02-02", "2026-02-22", 99999)],
    }),
  ]
  return [
    ...base,
    ...extraLines.map((extra, i) => apiLine(base.length + 1 + i, extra)),
  ]
}

type Channel = {
  name: string
  Component: ComponentType<any>
  feeProp: string
  cardLabel: string
  mediaTypes: string[]
  initialLineItems: any[]
}

const CHANNELS: Channel[] = [
  {
    name: "search",
    Component: SearchContainer,
    feeProp: "feesearch",
    cardLabel: "search",
    mediaTypes: ["search"],
    initialLineItems: lines("SE", "Google", "manual_cpc", []),
  },
  {
    name: "progDisplay",
    Component: ProgDisplayContainer,
    feeProp: "feeprogdisplay",
    cardLabel: "prog display",
    mediaTypes: ["progDisplay"],
    initialLineItems: lines("PD", "DV360", "reach", [
      // FB-6: a line saved with No Ad Serving on, bursts as a JSON string.
      {
        buy_type: "cpm",
        no_adserving: true,
        bursts: JSON.stringify([burst("$4,000.00", "$8.00", "2026-01-19", "2026-02-15")]),
      },
      // Per-burst ad serving overrides survive hydrate into the save payload.
      {
        buy_type: "cpm",
        bursts: [
          {
            ...burst("$6,000.00", "$12.00", "2026-02-01", "2026-02-28"),
            adServingRatePct: 0.35,
            adServingImpressions: 480000,
          },
        ],
      },
    ]),
  },
]

function strip(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, v) => (key === "_reactKey" ? undefined : v)),
  )
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
    rawCount: rec.rawCount,
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

/** The control a form label names (Radix checkbox or combobox trigger). */
function controlForLabel(text: string, nth: number): HTMLElement {
  const labels = [...document.querySelectorAll("label")].filter(
    (l) => l.textContent?.trim() === text,
  )
  const label = labels[nth]
  expect(label, `${text} #${nth}`).toBeTruthy()
  const item = label.parentElement as HTMLElement
  const control = item.querySelector('[role="checkbox"], [role="combobox"]') as HTMLElement
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

describe.each(CHANNELS)("$name container golden (W5afix)", (channel) => {
  let host: HTMLDivElement
  let root: Root
  let rec: Recorded

  const fresh = (): Recorded => ({
    media: null,
    excel: null,
    billing: null,
    investment: null,
    totals: null,
    rawCount: null,
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
          mediaTypes={channel.mediaTypes}
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
  })

  it("pins hydrate, card edits, buy type change, remove, expert Apply and create", async () => {
    const out: Record<string, unknown> = {}
    const n = channel.initialLineItems.length

    // 1. Edit hydrate across every live buy type.
    mount(channel.initialLineItems)
    await settle()
    out.hydrate = snapshot(rec)

    // 2. Fee-inclusive ticked on line 1 while its card is collapsed: only the
    //    hook recomputes deliverables (no card field is mounted).
    act(() => controlForLabel("Budget Includes Fees", 0).click())
    await settle()
    out.feeInclusiveCollapsed = snapshot(rec)

    // 3. Expand line 1 and type a budget and a buy amount on burst 2.
    expand(1)
    typeAndBlur('input[name="lineItems.0.bursts.1.budget"]', "$7,777.7")
    typeAndBlur('input[name="lineItems.0.bursts.1.buyAmount"]', "3.3")
    await settle()
    out.typed = snapshot(rec)

    // 4. Burst edits on line 1: Duplicate (copies the last burst), Add, then
    //    Remove the typed burst. Leaves [burst 1, its copy, a new empty burst].
    act(() => byLabel("Duplicate burst")[0].click())
    await settle()
    act(() => byLabel("Add burst")[0].click())
    await settle()
    act(() => byLabel("Remove burst")[1].click())
    await settle()
    out.burstEdits = snapshot(rec)

    // 5. Line 1 buy type changed to Bonus (bonus zeroes budget and buy amount).
    act(() => controlForLabel("Buy Type", 0).click())
    await settle(50)
    pickOption("Bonus")
    await settle()
    out.buyTypeToBonus = snapshot(rec)

    // 6. Remove line 3.
    const remove = buttons("Remove")
    expect(remove.length).toBe(n)
    act(() => remove[2].click())
    await settle()
    out.removeLine = snapshot(rec)

    // 7. Duplicate line 2, then Add a line at the end.
    act(() => buttons("Duplicate")[1].click())
    await settle()
    const add = buttons("Add Line Item")
    expect(add.length).toBe(1)
    act(() => add[0].click())
    await settle()
    out.duplicateAndAdd = snapshot(rec)

    // 8. Expert grid: edit row 2's creative, then Apply. jsdom has no layout,
    //    so give the grid's scroller a height or the virtualiser mounts no rows.
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.tagName === "THEAD" ? 40 : 2000
      })
    act(() => buttons("Schedule grid")[0].click())
    await settle(100)
    const creative = [...document.querySelectorAll("input")].find(
      (i) => (i as HTMLInputElement).value === "creative 2",
    ) as HTMLInputElement | undefined
    expect(creative, "expert creative cell").toBeTruthy()
    act(() => setInput(creative!, "creative 2 edited"))
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

    // 9. Create: empty channel, the placeholder Add, then a typed budget.
    mount([])
    await settle()
    const placeholderAdd = buttons("Add line item")
    expect(placeholderAdd.length).toBe(1)
    act(() => placeholderAdd[0].click())
    await settle()
    typeAndBlur('input[name="lineItems.0.bursts.0.budget"]', "4321")
    await settle()
    out.create = snapshot(rec)

    // 10. W5e (review F3): a plan with a gap in its line ids (1, 2, 4), read
    //     back with `line_item` as the saved position, as Postgres gives it.
    //     The saved and billing ids stay 1, 2, 4. Then Remove line 1.
    act(() => root.unmount())
    root = createRoot(host)
    rec = fresh()
    const ids = (nums: number[]) => nums.map((k) => channel.initialLineItems[0].line_item_id.replace(/1$/, String(k)))
    mount(
      [0, 1, 3].map((i, position) => ({ ...channel.initialLineItems[i], line_item: position })),
    )
    await settle()
    out.lineIdGap = snapshot(rec)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(ids([1, 2, 4]))
    expect([...new Set(rec.billing!.map((b) => b.lineItemId))]).toEqual(ids([1, 2, 4]))
    // C-340: Excel rows (and so the naming workbook) carry the stored ids too.
    expect([...new Set(rec.excel!.map((r) => r.line_item_id))]).toEqual(ids([1, 2, 4]))
    act(() => buttons("Remove")[0].click())
    await settle()
    out.lineIdGapRemove = snapshot(rec)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(ids([2, 4]))
    expect([...new Set(rec.excel!.map((r) => r.line_item_id))]).toEqual(ids([2, 4]))

    const golden = resolve(
      process.cwd(),
      `components/media-containers/__tests__/fixtures/${channel.name}Container.golden.json`,
    )
    const text = `${JSON.stringify(out, null, 2)}\n`
    if (process.env.UPDATE_GOLDEN === "1") {
      writeFileSync(golden, text)
    }
    expect(text).toBe(readFileSync(golden, "utf8"))
  }, 60_000)
})
