/**
 * M1 goldens: the money a fee-inclusive line shows today, pinned to the last
 * float bit before net media moves onto one formula (C-391, C-393, C-396).
 *
 * Surfaces: net from gross, planned deliverables from media, pacing net
 * media (bursts, and the no-burst line budget), expected spend in a window
 * (with and without the stored line `totalMedia`), direct digital estimated
 * spend, billing line items (the fee backed out of `totalMedia`), KPI
 * grouping and the campaign Gantt fill.
 *
 * Fixtures: fee-inclusive lines, bonus and package inclusions lines, 0% and
 * fractional fees, and cent-edge pairs (a budget and fee where two float
 * orders of the same net media round to different cents with a plain
 * Math.round: 0.35 at 10%, 10.50 at 7%).
 *
 * Regenerate only for an intended behaviour change:
 *   UPDATE_GOLDEN=1 node scripts/run-tests.mjs lib/money/__tests__/netMedia.golden
 */
import "@/lib/testing/melbourneZone"
import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { reshapeLineItemsToMediaGantt } from "@/components/dashboard/campaign/mediaGanttReshape"
import { generateBillingLineItems } from "@/lib/billing/generateBillingLineItems"
import { estimateDirectDigitalSpend } from "@/lib/delivery/estimateDirectDigitalSpend"
import { setClientFeatureSnapshot } from "@/lib/features/client"
import { groupLineItemsForKPI } from "@/lib/kpi/grouping"
import type { LineItem } from "@/lib/generateMediaPlan"
import { computeDeliverableFromMedia, netFromGross } from "@/lib/mediaplan/deliverableBudget"
import { lineSaveTotalMedia } from "@/lib/money/burst"
import { toCents } from "@/lib/money/cents"
import type { NormalisedLineItem } from "@/lib/mediaplan/normalizeLineItem"
import { lineExpectedNetToDate, netBurstMediaForPacing } from "@/lib/pacing/detail/netBurstMediaForPacing"
import { expectedForWindow, plannedTotal } from "@/lib/pacing/expectedForWindow"

const GOLDEN = join(process.cwd(), "lib/money/__tests__/fixtures/netMedia.golden.json")
const ON_GOLDEN = join(process.cwd(), "lib/money/__tests__/fixtures/netMedia.on.golden.json")

/** Gross budget and channel fee percent. */
const PAIRS: ReadonlyArray<readonly [number, number]> = [
  [15000, 10],
  [24680.4, 10],
  [13751.18, 20],
  [5833.39, 10],
  [1458.33, 10],
  [7701.25, 20],
  [3077.4, 20],
  [2500, 12.5],
  [1234.56, 17.75],
  [999.99, 33.33],
  [1000, 0],
  [0.35, 10],
  [5.25, 10],
  [10.5, 7],
  [17.5, 7],
  [266, 0.25],
]

const WINDOW = { startISO: "2026-03-01", endISO: "2026-03-20", filtered: true, empty: false }

/** NaN is the deliverable "no recompute" sentinel: keep it in the golden as text. */
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "number" && Number.isNaN(v) ? "NaN" : v)))
}

function feeLine(id: string, gross: readonly number[], extra: Record<string, unknown> = {}) {
  return {
    line_item_id: id,
    lineItemId: id,
    platform: "Meta",
    publisher: "Meta",
    buyType: "cpm",
    buy_type: "cpm",
    budgetIncludesFees: true,
    budget_includes_fees: true,
    bursts: gross.map((g, i) => ({
      budget: g,
      buyAmount: 12.5,
      startDate: `2026-0${2 + i}-01`,
      endDate: `2026-0${2 + i}-28`,
      calculatedValue: Math.round((g * 0.9 * 1000) / 12.5),
    })),
    ...extra,
  }
}

/** Every surface, in today's numbers. */
function computeSurfaces() {
  const out: Record<string, unknown> = {}

  out.netFromGross = PAIRS.map(([g, p]) => netFromGross(g, true, p))
  out.netFromGrossExcludesFees = PAIRS.map(([g, p]) => netFromGross(g, false, p))

  out.deliverables = PAIRS.map(([g, p]) => ({
    cpm: computeDeliverableFromMedia({ buyType: "cpm", rawBudget: g, buyAmount: 12.5, budgetIncludesFees: true, feePct: p }),
    cpc: computeDeliverableFromMedia({ buyType: "cpc", rawBudget: g, buyAmount: 1.37, budgetIncludesFees: true, feePct: p }),
    bonus: computeDeliverableFromMedia({ buyType: "bonus", rawBudget: g, buyAmount: 1, budgetIncludesFees: true, feePct: p }),
  }))

  out.pacingBurstNet = PAIRS.map(([g, p]) => ({
    feeIncl: netBurstMediaForPacing({ budget: g }, { budgetIncludesFees: true }, p),
    stored: netBurstMediaForPacing({ budget: g, mediaAmount: 100 }, { budgetIncludesFees: true }, p),
    net: netBurstMediaForPacing({ budget: g }, { budgetIncludesFees: false }, p),
  }))

  const base = { lineStart: "2026-02-01", lineEnd: "2026-04-30", asOf: "2026-03-15", lineItemId: "m1-line" }
  out.lineExpectedNetToDate = PAIRS.map(([g, p]) => ({
    bursts: lineExpectedNetToDate({
      ...base,
      bursts: [
        { startDate: "2026-02-01", endDate: "2026-02-28", budget: g },
        { startDate: "2026-03-01", endDate: "2026-04-30", budget: g / 3 },
      ],
      budgetIncludesFees: true,
      feePct: p,
      lineBudget: 0,
    }),
    noBursts: lineExpectedNetToDate({ ...base, bursts: [], budgetIncludesFees: true, feePct: p, lineBudget: g }),
  }))

  out.expectedForWindow = PAIRS.map(([g, p]) => {
    const line = feeLine("m1", [g, g / 2])
    const noTotal = { budgetIncludesFees: true, feePct: p }
    const withTotal = { ...noTotal, lineTotalMedia: (g * (100 - p)) / 100 + ((g / 2) * (100 - p)) / 100 }
    return {
      planned: plannedTotal(line.bursts, "spend", noTotal),
      expected: expectedForWindow(line.bursts, "spend", WINDOW, noTotal),
      plannedWithTotal: plannedTotal(line.bursts, "spend", withTotal),
      expectedWithTotal: expectedForWindow(line.bursts, "spend", WINDOW, withTotal),
      deliverables: expectedForWindow(line.bursts, "deliverables", WINDOW, noTotal),
    }
  })

  out.directDigitalEstimate = PAIRS.map(([g, p], i) => {
    const r = estimateDirectDigitalSpend({
      lineItemId: `m1dd${i}`,
      buyType: i % 2 === 0 ? "cpm" : "cpc",
      budgetIncludesFees: true,
      feePct: p,
      versionId: 1,
      bursts: [{ budget: `$${g.toFixed(2)}`, calculatedValue: 40000 + i * 333 }],
      days: [
        { date: "2026-03-01", impressions: 12000 + i * 17, clicks: 210 + i },
        { date: "2026-03-02", impressions: 9000 + i * 11, clicks: 175 + i },
      ],
    })
    return { amount: r.amount, plannedMedia: r.plannedMedia, days: r.days, spendMode: r.spendMode }
  })

  const months = [{ monthYear: "February 2026" }, { monthYear: "March 2026" }, { monthYear: "April 2026" }]
  const billingLines = PAIRS.map(([g, p], i) =>
    feeLine(`m1so${i + 1}`, [g, g / 4], {
      totalMedia: (g * (100 - p)) / 100 + ((g / 4) * (100 - p)) / 100,
    }),
  )
  billingLines.push(
    feeLine("m1so90", [5000], { buyType: "bonus", buy_type: "bonus", totalMedia: 4500 }),
    feeLine("m1so91", [2000], { buyType: "package_inclusions", buy_type: "package_inclusions", totalMedia: 1800 }),
  )
  out.billing = (["billing", "delivery"] as const).map((mode) =>
    generateBillingLineItems(billingLines, "socialMedia", months, mode, {
      resolveLineItemId: (_t, li) => String((li as { line_item_id: string }).line_item_id),
    }).map((row) => ({
      id: row.id,
      monthlyAmounts: row.monthlyAmounts,
      totalAmount: row.totalAmount,
      feeMonthlyAmounts: row.feeMonthlyAmounts,
      totalFeeAmount: row.totalFeeAmount,
    })),
  )

  out.kpiGrouping = groupLineItemsForKPI(
    [
      ...billingLines.map((l) => ({ ...l, deliverables: 1000 })),
      { ...billingLines[0], grossMedia: 777.77, deliverables: 5 },
    ] as unknown as LineItem[],
    { mbaNumber: "m1", mediaType: "socialMedia", packageNoUnitTarget: false },
  ).map((g) => ({ lineItemId: g.lineItemId, spend: g.spend, deliverables: g.deliverables }))

  out.ganttFill = ([false, true] as const).map((flighting) => {
    const delivered = new Map<string, number>([
      ["m1gt1", 1500],
      ["m1gt2", 4321],
      ["m1gt3", 0],
      ["m1gt4", 10],
      ["m1gt6", 250],
    ])
    const item = (id: string, deliverables: number[], buyType = "cpm"): NormalisedLineItem =>
      ({
        lineItemId: id,
        publisher: "Pub",
        mediaType: "search",
        buyType,
        bursts: deliverables.map((d, i) => ({
          startDate: `2026-0${2 + i}-02`,
          endDate: `2026-0${2 + i}-20`,
          deliverables: d,
          budget: 1000,
        })),
      }) as unknown as NormalisedLineItem
    const gantt = reshapeLineItemsToMediaGantt(
      {
        search: [
          item("m1gt1", [1000, 2000]),
          item("m1gt2", [1000, 2000]),
          item("m1gt3", [1000]),
          item("m1gt4", [0]),
          item("m1gt5", [1000]),
          item("m1gt6", [333], "bonus"),
        ],
      },
      "2026-02-01",
      "2026-04-30",
      "weekly",
      delivered,
      flighting,
      { packageNoUnitTarget: false },
    )
    return (gantt?.rows ?? []).map((row) => row.bursts.map((b) => b.fillRatio ?? null))
  })

  return plain(out) as Record<string, unknown>
}

test("M1 goldens: today's net media, pacing, estimate, billing, KPI and Gantt numbers are byte-identical", () => {
  const actual = computeSurfaces()
  if (process.env.UPDATE_GOLDEN === "1") {
    writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`)
    return
  }
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8"))
  assert.deepStrictEqual(actual, golden)
})

/** Leaf paths where two plain values differ. */
function moves(off: unknown, on: unknown, path = ""): Array<{ path: string; off: unknown; on: unknown }> {
  if (off && on && typeof off === "object" && typeof on === "object") {
    const keys = new Set([...Object.keys(off), ...Object.keys(on)])
    return [...keys].flatMap((k) =>
      moves((off as Record<string, unknown>)[k], (on as Record<string, unknown>)[k], path ? `${path}.${k}` : k),
    )
  }
  return Object.is(off, on) ? [] : [{ path, off, on }]
}

/** The save row's totalMedia and what reads it: pacing (lineTotalMedia), billing (fee backed out) and KPI grouping. */
function savedTotalMediaChain(oneNetMedia: boolean) {
  const line = (id: string, gross: number[], p: number, extra: Record<string, unknown> = {}) => {
    const l = { ...feeLine(id, gross), ...extra }
    return { ...l, feePct: p, totalMedia: lineSaveTotalMedia(l, p, oneNetMedia) }
  }
  const lines = [
    ...PAIRS.map(([g, p], i) => line(`m1tm${i + 1}`, [g, g / 4], p)),
    line("m1tm90", [5000], 15, { buyType: "bonus" }),
    line("m1tm91", [2000], 15, { buyType: "package_inclusions" }),
    line("m1tm92", [3000], 15, { buyType: "package_inclusions", budgetIncludesFees: false, budget_includes_fees: false }),
    line("m1tm93", [1000], 20, { clientPaysForMedia: true }),
  ]
  const months = [{ monthYear: "February 2026" }, { monthYear: "March 2026" }, { monthYear: "April 2026" }]
  return plain({
    totalMedia: lines.map((l) => l.totalMedia),
    totalMediaCents: lines.map((l) => toCents(l.totalMedia)),
    expectedWithTotal: lines.map((l) =>
      expectedForWindow(l.bursts, "spend", WINDOW, { budgetIncludesFees: true, feePct: l.feePct, lineTotalMedia: l.totalMedia }),
    ),
    billingDelivery: generateBillingLineItems(
      lines.map(({ feePct: _f, ...l }) => l),
      "socialMedia",
      months,
      "delivery",
      { resolveLineItemId: (_t, li) => String((li as { line_item_id: string }).line_item_id) },
    ).map((row) => ({ id: row.id, totalAmount: row.totalAmount, totalFeeAmount: row.totalFeeAmount })),
    kpiSpend: groupLineItemsForKPI(lines as unknown as LineItem[], {
      mbaNumber: "m1",
      mediaType: "socialMedia",
      packageNoUnitTarget: false,
    }).map((g) => g.spend),
  }) as Record<string, unknown>
}

test("one_net_media on: only the listed goldens move, each by the amount pinned here", (t) => {
  const offChain = savedTotalMediaChain(false)
  setClientFeatureSnapshot({ one_net_media: true })
  t.after(() => setClientFeatureSnapshot(null))
  const actual = plain({
    surfaces: moves(JSON.parse(readFileSync(GOLDEN, "utf8")), computeSurfaces()),
    savedTotalMedia: moves(offChain, savedTotalMediaChain(true)),
  })
  if (process.env.UPDATE_GOLDEN === "1") {
    writeFileSync(ON_GOLDEN, `${JSON.stringify(actual, null, 2)}\n`)
    return
  }
  assert.deepStrictEqual(actual, JSON.parse(readFileSync(ON_GOLDEN, "utf8")))
})

test("one_net_media off: the save row totalMedia chain is the old local split", () => {
  const chain = savedTotalMediaChain(false)
  const totals = chain.totalMedia as number[]
  // Bonus and package inclusions with a budget still save their net budget (C-391), until the switch is on.
  assert.equal(totals[PAIRS.length], (5000 * 85) / 100)
  assert.equal(totals[PAIRS.length + 2], 3000)
})
