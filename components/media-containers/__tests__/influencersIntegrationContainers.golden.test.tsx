/**
 * W5b goldens: Influencers and Integration saved output, pinned before and
 * after their move onto the shared channel container.
 *
 * Records what the container hands the plan page:
 * - the save payload (onMediaLineItemsChange) and the persisted bursts it
 *   becomes (extractAndFormatBursts, the bursts_json write contract)
 * - the billing schedule input (onBurstsChange)
 * - the Excel rows (onLineItemsChange)
 * - the monthly investment, the header totals and the header line count
 *
 * Key order is canonical (keys sorted). The save payload is stored as jsonb,
 * which keeps no key order, and the page reads every field by name, so only
 * the keys and values are pinned.
 *
 * Hydrate covers every buy type live on each channel, fee-inclusive and
 * client-pays lines, a saved burst `fee`, a burst with no dates and one with
 * no end date (Influencers falls back to now: Date is pinned), a stale
 * calculatedValue, a bonus quantity saved as a string, and No Ad Serving
 * (FB-6), including Integration's camel `noAdserving` (C-36). Integration
 * also loads a repeated line id and two repeated lines with no id (its load
 * de-dupe).
 * Then it drives: fee-inclusive ticked on a collapsed card, card typing on an
 * expanded card (C-333), Add / Duplicate / Remove burst, a reload with the
 * same lines and a changed budget (Integration keeps its form), a buy type
 * change to Bonus, Remove line, Duplicate (placed after the source) and Add
 * line, an edited expert grid Apply, and the create path.
 *
 * Regenerate only for an intended behaviour change:
 *   UPDATE_GOLDEN=1 npx vitest run components/media-containers/__tests__/influencersIntegrationContainers.golden.test.tsx
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
  getPublishersForInfluencers: async () => [
    { id: 1, publisher_name: "Instagram" },
    { id: 2, publisher_name: "TikTok" },
  ],
  getPublishersForIntegration: async () => [
    { id: 3, publisher_name: "Nine" },
    { id: 4, publisher_name: "Seven" },
  ],
}))

const { default: InfluencersContainer } = await import(
  "@/components/media-containers/InfluencersContainer"
)
const { default: IntegrationContainer } = await import(
  "@/components/media-containers/IntegrationContainer"
)

const FEE = 12.5
// Not midnight on purpose: a burst with no saved date falls back from these.
const CAMPAIGN_START = new Date(2026, 0, 5, 9, 15)
const CAMPAIGN_END = new Date(2026, 2, 31, 15, 30)
// Influencers hydrates a burst with no date to now.
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

function apiLine(code: string, platform: string, n: number, extra: Record<string, unknown>) {
  return {
    line_item_id: `tst001${code}${n}`,
    line_item: n,
    platform,
    bid_strategy: "manual_cpc",
    buy_type: "cpm",
    objective: `objective ${n}`,
    campaign: `campaign ${n}`,
    targeting_attribute: `targeting ${n}`,
    creative_targeting: `placement ${n}`,
    creative: `creative ${n}`,
    buying_demo: "P18+",
    market: "National",
    fixed_cost_media: false,
    client_pays_for_media: false,
    budget_includes_fees: false,
    no_adserving: false,
    ...extra,
  }
}

/** Line 1 is the same on both channels: cpm, two bursts, a saved fee. */
function firstLine(code: string, platform: string, budget = "$5,000.00") {
  return apiLine(code, platform, 1, {
    buy_type: "cpm",
    bursts: [
      burst(budget, "$12.50", "2026-01-12", "2026-02-15", { fee: 625 }),
      burst("3000", "15", "2026-02-16", "2026-03-15"),
    ],
  })
}

function influencersLines(budget?: string) {
  const L = (n: number, extra: Record<string, unknown>) => apiLine("IN", "Instagram", n, extra)
  return [
    firstLine("IN", "Instagram", budget),
    L(2, {
      buy_type: "fixed_cost",
      fixed_cost_media: true,
      budget_includes_fees: true,
      bursts: [burst("$12,000.00", "$12,000.00", "2026-01-05", "2026-01-31")],
    }),
    // No dates at all: falls back to now on Influencers.
    L(3, {
      buy_type: null,
      client_pays_for_media: true,
      bursts: [burst("$1,000.00", "$20.00")],
    }),
    L(4, {
      buy_type: "package_inclusions",
      bursts: [burst("0", "0", "2026-03-02", "2026-03-29", { calculatedValue: "4" })],
    }),
    // FB-6: No Ad Serving saved on; a stale calculatedValue; no end date.
    L(5, {
      buy_type: "cpm",
      no_adserving: true,
      bursts: JSON.stringify([
        burst("$2,000.00", "$2.00", "2026-02-02", undefined, { calculatedValue: 99999 }),
      ]),
    }),
  ]
}

function integrationLines(budget?: string) {
  const L = (n: number, extra: Record<string, unknown>) => apiLine("IT", "Nine", n, extra)
  const camelNoAdserving: Record<string, unknown> = L(7, {
    buy_type: "cpm",
    noAdserving: true,
    bursts: [burst("$6,000.00", "$12.00", "2026-02-01", "2026-02-28")],
  })
  delete camelNoAdserving.no_adserving
  const noId = (platform: string) => {
    const line: Record<string, unknown> = L(0, {
      platform,
      objective: "objective x",
      campaign: "campaign x",
      buy_type: "cpm",
      bursts: [burst("$700.00", "$7.00", "2026-01-12", "2026-01-25")],
    })
    delete line.line_item_id
    delete line.line_item
    return line
  }
  return [
    firstLine("IT", "Nine", budget),
    L(2, {
      buy_type: "package",
      budget_includes_fees: true,
      bursts: [burst("$12,000.00", "$1,500.00", "2026-01-05", "2026-01-31", { calculatedValue: 8 })],
    }),
    L(3, {
      buy_type: null,
      client_pays_for_media: true,
      bursts: [burst("$1,000.00", "$20.00")],
    }),
    L(4, {
      buy_type: "bonus",
      client_pays_for_media: true,
      bursts: [burst("0", "0", "2026-03-02", "2026-03-29", { calculatedValue: "500" })],
    }),
    L(5, {
      buy_type: "package_inclusions",
      bursts: [burst("0", "0", "2026-02-02", "2026-02-22", { calculatedValue: 3 })],
    }),
    // FB-6 snake, client pays, no end date.
    L(6, {
      buy_type: "fixed_cost",
      client_pays_for_media: true,
      no_adserving: true,
      bursts: JSON.stringify([burst("$4,000.00", "$4,000.00", "2026-01-19")]),
    }),
    // C-36: Integration's camel spelling only.
    camelNoAdserving,
    // De-dupe: a repeated line id, then two repeated lines with no id.
    { ...firstLine("IT", "Seven"), objective: "repeated id" },
    noId("Seven"),
    noId("Seven"),
  ]
}

type Channel = {
  name: string
  Component: ComponentType<any>
  feeProp: string
  cardLabel: string
  lines: (budget?: string) => any[]
  /** A grid text cell value on row 2, and its edit. */
  expertCell: [string, string]
}

const CHANNELS: Channel[] = [
  {
    name: "influencers",
    Component: InfluencersContainer,
    feeProp: "feeinfluencers",
    cardLabel: "influencers",
    lines: influencersLines,
    expertCell: ["objective 2", "objective 2 edited"],
  },
  {
    name: "integration",
    Component: IntegrationContainer,
    feeProp: "feeintegration",
    cardLabel: "integration",
    lines: integrationLines,
    expertCell: ["creative 2", "creative 2 edited"],
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

describe.each(CHANNELS)("$name container golden (W5b)", (channel) => {
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

  it("pins hydrate, card edits, reload, buy type change, remove, duplicate, expert Apply and create", async () => {
    const out: Record<string, unknown> = {}
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    // 1. Edit hydrate across every live buy type.
    mount(channel.lines())
    await settle()
    out.hydrate = snapshot(rec)
    // The de-dupe warning's counts (its tag text is not output).
    out.hydrateDedupe = warn.mock.calls
      .map((c) => /Deduped initialLineItems from (\d+) to (\d+)/.exec(String(c[0])))
      .filter(Boolean)
      .map((m) => `${m![1]} to ${m![2]}`)
    const n = (rec.media ?? []).length

    // 2. Fee-inclusive ticked on line 1 while its card is collapsed: only the
    //    hook recomputes deliverables (no card field is mounted).
    act(() => controlForLabel("Budget Includes Fees", 0).click())
    await settle()
    out.feeInclusiveCollapsed = snapshot(rec)

    // 3. Expand line 1 and type a budget and a buy amount on burst 2 (C-333).
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

    // 5. The page passes the same lines again as a new array, line 1's first
    //    budget changed. Integration keys its load on ids and labels and keeps
    //    its form; Influencers hydrates again.
    mount(channel.lines("$9,999.00"))
    await settle()
    out.reload = snapshot(rec)

    // 6. Line 1 buy type changed to Bonus (bonus zeroes budget and buy amount).
    ensureExpanded(1)
    act(() => controlForLabel("Buy Type", 0).click())
    await settle(50)
    pickOption("Bonus")
    await settle()
    out.buyTypeToBonus = snapshot(rec)

    // 7. Remove line 3.
    const remove = buttons("Remove")
    expect(remove.length).toBe(n)
    act(() => remove[2].click())
    await settle()
    out.removeLine = snapshot(rec)

    // 8. Duplicate line 2 (the copy lands after its source), then Add a line.
    act(() => buttons("Duplicate")[1].click())
    await settle()
    const add = buttons("Add Line Item")
    expect(add.length).toBe(1)
    act(() => add[0].click())
    await settle()
    out.duplicateAndAdd = snapshot(rec)

    // 9. Expert grid: edit a row 2 text cell, then Apply. jsdom has no layout,
    //    so give the grid's scroller a height or the virtualiser mounts no rows.
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.tagName === "THEAD" ? 40 : 2000
      })
    act(() => buttons("Schedule grid")[0].click())
    await settle(100)
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog, "expert dialog").toBeTruthy()
    const [from, to] = channel.expertCell
    const cell = [...dialog.querySelectorAll("input")].find(
      (i) => (i as HTMLInputElement).value === from,
    ) as HTMLInputElement | undefined
    expect(cell, "expert text cell").toBeTruthy()
    act(() => setInput(cell!, to))
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

    // 10. Create: empty channel, the placeholder Add, then a typed budget.
    mount([])
    await settle()
    const placeholderAdd = buttons("Add line item")
    expect(placeholderAdd.length).toBe(1)
    act(() => placeholderAdd[0].click())
    await settle()
    typeAndBlur('input[name="lineItems.0.bursts.0.budget"]', "4321")
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
  }, 60_000)
})
