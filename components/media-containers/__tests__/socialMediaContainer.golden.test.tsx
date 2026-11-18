/**
 * W5a golden: SocialMediaContainer saved output, pinned byte for byte.
 *
 * Mounts the real container and records what it hands the plan page:
 * - the save payload (onMediaLineItemsChange) and the persisted bursts it
 *   becomes (extractAndFormatBursts, the bursts_json write contract)
 * - the billing schedule input (onBurstsChange)
 * - the Excel rows (onLineItemsChange)
 * - the monthly investment, the header totals and the raw line count
 *
 * Covers every buy type live on social lines (cpm, cpc, cpv, fixed_cost,
 * bonus, empty and null), fee-inclusive and client-pays lines, a numeric
 * budget, a burst with no end date, a line saved with No Ad Serving on
 * (FB-6: social billing bursts always say false), card typing, Add,
 * Duplicate, the empty placeholder and an expert Apply round trip.
 *
 * Regenerate only for an intended behaviour change:
 *   UPDATE_GOLDEN=1 npx vitest run components/media-containers/__tests__/socialMediaContainer.golden.test.tsx
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { extractAndFormatBursts } from "@/lib/mediaplan/formatBurstsForPersist"
import { resetWeekStartsOnStore } from "@/lib/mediaplan/useWeekStartsOn"

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForSocialMedia: async () => [
    { id: 1, publisher_name: "Meta" },
    { id: 2, publisher_name: "TikTok" },
  ],
}))

const { default: SocialMediaContainer } = await import(
  "@/components/media-containers/SocialMediaContainer"
)

const GOLDEN = resolve(
  process.cwd(),
  "components/media-containers/__tests__/fixtures/socialMediaContainer.golden.json",
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

function apiLine(n: number, extra: Record<string, unknown>) {
  return {
    line_item_id: `tst001SM${n}`,
    line_item: n,
    platform: "Meta",
    bid_strategy: "reach",
    buy_type: "cpm",
    creative_targeting: `targeting ${n}`,
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

function burst(budget: unknown, buyAmount: unknown, start: string, end?: string, calc?: unknown) {
  const b: Record<string, unknown> = { budget, buyAmount, startDate: start }
  if (end !== undefined) b.endDate = end
  if (calc !== undefined) b.calculatedValue = calc
  return b
}

const EDIT_LINES = [
  apiLine(1, {
    buy_type: "cpm",
    bursts: [
      burst("$12,000.00", "$15.00", "2026-01-05", "2026-01-31"),
      burst("8000", "14.5", "2026-02-01", "2026-02-28"),
    ],
  }),
  apiLine(2, {
    buy_type: "cpc",
    budget_includes_fees: true,
    platform: "TikTok",
    bursts: [burst("$5,000.00", "$1.25", "2026-01-12", "2026-03-15")],
  }),
  apiLine(3, {
    buy_type: "cpv",
    bursts: [burst("$3,333.33", "$0.07", "2026-02-02", "2026-02-22")],
  }),
  apiLine(4, {
    buy_type: "fixed_cost",
    fixed_cost_media: true,
    client_pays_for_media: true,
    bursts: [burst("$9,999.99", "$9,999.99", "2026-01-05", "2026-03-31")],
  }),
  apiLine(5, {
    buy_type: "bonus",
    bursts: [burst("$0.00", "$0.00", "2026-01-05", "2026-01-25", 125000)],
  }),
  apiLine(6, {
    buy_type: "",
    bursts: [burst(2500, 10, "2026-03-02", "2026-03-29")],
  }),
  apiLine(7, {
    buy_type: null,
    budget_includes_fees: true,
    bursts: [burst("$1,000.00", "$20.00", "2026-03-01")],
  }),
  // FB-6: a social line saved with No Ad Serving on, bursts as a JSON string.
  apiLine(8, {
    buy_type: "cpm",
    no_adserving: true,
    bursts: JSON.stringify([burst("$4,000.00", "$8.00", "2026-01-19", "2026-02-15")]),
  }),
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

function buttons(host: HTMLElement, text: string): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")].filter(
    (b) => b.textContent?.trim() === text && (host.contains(b) || document.body.contains(b)),
  ) as HTMLButtonElement[]
}

describe("SocialMediaContainer golden (W5a)", () => {
  let host: HTMLDivElement
  let root: Root
  let rec: Recorded

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
    onSocialMediaLineItemsChange: (i: any[]) => {
      rec.rawCount = i.length
    },
    onMediaLineItemsChange: (i: any[]) => {
      rec.media = i
    },
  }

  function mount(initialLineItems: any[]) {
    act(() => {
      root.render(
        <SocialMediaContainer
          clientId="client-1"
          feesocial={FEE}
          {...callbacks}
          campaignStartDate={CAMPAIGN_START}
          campaignEndDate={CAMPAIGN_END}
          campaignBudget={100000}
          campaignId=""
          mediaTypes={["social"]}
          initialLineItems={initialLineItems}
        />,
      )
    })
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    resetWeekStartsOnStore()
    rec = { media: null, excel: null, billing: null, investment: null, totals: null, rawCount: null }
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("pins hydrate, typing, Add, Duplicate, the empty placeholder and expert Apply", async () => {
    const out: Record<string, unknown> = {}

    // 1. Edit hydrate across every live buy type.
    mount(EDIT_LINES)
    await settle()
    out.hydrate = snapshot(rec)

    // 2. Card typing on line 1, burst 2: change + blur (budget, then buy amount).
    const toggle = document.querySelector(
      'button[aria-label="Expand details for social media line item 1"]',
    ) as HTMLButtonElement
    expect(toggle).toBeTruthy()
    act(() => toggle.click())
    const budget = document.querySelector(
      'input[name="lineItems.0.bursts.1.budget"]',
    ) as HTMLInputElement
    expect(budget).toBeTruthy()
    act(() => setInput(budget, "$9,250.5"))
    act(() => budget.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
    const buyAmount = document.querySelector(
      'input[name="lineItems.0.bursts.1.buyAmount"]',
    ) as HTMLInputElement
    act(() => setInput(buyAmount, "18.75"))
    act(() => buyAmount.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
    await settle()
    out.typed = snapshot(rec)

    // 3. Duplicate line 2, then Add a line at the end.
    const dup = buttons(host, "Duplicate")
    expect(dup.length).toBe(EDIT_LINES.length)
    act(() => dup[1].click())
    await settle()
    const add = buttons(host, "Add Line Item")
    expect(add.length).toBe(1)
    act(() => add[0].click())
    await settle()
    out.duplicateAndAdd = snapshot(rec)

    // 4. Expert Apply round trip (open the grid, apply unchanged).
    const grid = buttons(host, "Schedule grid")
    expect(grid.length).toBe(1)
    act(() => grid[0].click())
    await settle(100)
    const apply = buttons(host, "Apply to plan (not saved yet)")
    expect(apply.length).toBe(1)
    act(() => apply[0].click())
    await settle()
    out.expertApply = snapshot(rec)

    act(() => root.unmount())
    root = createRoot(host)
    rec = { media: null, excel: null, billing: null, investment: null, totals: null, rawCount: null }

    // 5. Create: empty channel, the placeholder Add, then a typed budget.
    mount([])
    await settle()
    const placeholderAdd = buttons(host, "Add line item")
    expect(placeholderAdd.length).toBe(1)
    act(() => placeholderAdd[0].click())
    await settle()
    const newBudget = document.querySelector(
      'input[name="lineItems.0.bursts.0.budget"]',
    ) as HTMLInputElement
    expect(newBudget).toBeTruthy()
    act(() => setInput(newBudget, "4321"))
    act(() => newBudget.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
    await settle()
    out.create = snapshot(rec)

    // 6. W5e (review F3): a plan with a gap in its line ids (1, 2, 4), read
    //    back with `line_item` as the saved position, as Postgres gives it.
    //    The saved ids stay 1, 2, 4. Then Remove line 1.
    act(() => root.unmount())
    root = createRoot(host)
    rec = { media: null, excel: null, billing: null, investment: null, totals: null, rawCount: null }
    mount(
      [1, 2, 4].map((n, position) => ({
        ...apiLine(n, { bursts: [burst(`$${n},000.00`, "$10.00", "2026-01-12", "2026-02-08")] }),
        line_item: position,
      })),
    )
    await settle()
    out.lineIdGap = snapshot(rec)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(["tst001SM1", "tst001SM2", "tst001SM4"])
    // C-340: Excel rows (and so the naming workbook) carry the stored ids too.
    expect([...new Set(rec.excel!.map((r) => r.line_item_id))]).toEqual(["tst001SM1", "tst001SM2", "tst001SM4"])
    act(() => buttons(host, "Remove")[0].click())
    await settle()
    out.lineIdGapRemove = snapshot(rec)
    expect(rec.media!.map((l) => l.line_item_id)).toEqual(["tst001SM2", "tst001SM4"])
    expect([...new Set(rec.excel!.map((r) => r.line_item_id))]).toEqual(["tst001SM2", "tst001SM4"])

    const text =`${JSON.stringify(out, null, 2)}\n`
    if (process.env.UPDATE_GOLDEN === "1") {
      writeFileSync(GOLDEN, text)
    }
    expect(text).toBe(readFileSync(GOLDEN, "utf8"))
  }, 60_000)
})
