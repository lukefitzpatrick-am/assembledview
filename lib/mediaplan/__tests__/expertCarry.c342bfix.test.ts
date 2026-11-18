import "@/lib/testing/bothZones"
/**
 * C342Bfix: the C342B review's Low items on the expert grid's carry (V66 B),
 * through the mappers the containers run (open, Apply, merge).
 *
 * - L1: an OOH panels burst saved with a budget and deliverables 0 or blank
 *   reached the grid (the import reads its rate as the panel count), so a
 *   no-edit Apply keeps its saved budget.
 * - L2: a carried burst takes its own buy type from the saved burst, never
 *   from the burst the mapper wrote in the same place.
 */
import assert from "node:assert/strict"
import test from "node:test"

import * as M from "@/lib/mediaplan/expertChannelMappings"
import * as S from "@/lib/mediaplan/expertModeSwitch"
import { expertRowBudget } from "@/lib/mediaplan/expertRowCost"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import { lineTotals } from "@/lib/money/burst"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

const START = new Date(2026, 2, 1)
const END = new Date(2026, 2, 28)
const COLS = buildWeeklyGanttColumnsFromCampaign(START, END)
const WEEK_KEYS = COLS.map((c) => c.weekKey)
const FEE = 12.5

const cents = (v: unknown) => Math.round(parseBurstMoney(v) * 100)
const ymd = (d: unknown) =>
  d instanceof Date
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : String(d ?? "").slice(0, 10)
/** Each burst as [budget cents, deliverables, own buy type, start, end], in date order. */
const read = (line: any) =>
  [...line.bursts]
    .map((b: any) => [cents(b.budget), Number(b.calculatedValue), b.buyType ?? "", ymd(b.startDate), ymd(b.endDate)] as const)
    .sort((a, b) => `${a[3]}${a[4]}`.localeCompare(`${b[3]}${b[4]}`))

function oohLine(bursts: any[], incl = false, buyType = "panels") {
  return {
    network: "N",
    format: "F",
    buyType,
    budgetIncludesFees: incl,
    clientPaysForMedia: false,
    fixedCostMedia: false,
    noAdserving: false,
    line_item_id: "fixOoh1",
    lineItemId: "fixOoh1",
    line_item: 1,
    lineItem: 1,
    bursts,
  }
}

const ooh = {
  open: (saved: any[]) => M.mapStandardOohLineItemsToExpertRows(saved, COLS, START, END) as any[],
  /** The pure mapper: rows to lines, no merge. */
  map: (rows: any[]) => M.mapOohExpertRowsToStandardLineItems(rows, COLS, START, END, { feePctOoh: FEE }) as any[],
  /** The round trip the container runs: map, then merge onto the saved lines. */
  apply: (rows: any[], saved: any[]) =>
    S.mergeOohStandardFromExpertWithPrevious(ooh.map(rows) as any, saved as any) as any[],
}

// --- L1 -------------------------------------------------------------------

for (const [label, extra] of [
  ["blank", {}],
  ["0", { calculatedValue: 0 }],
] as const) {
  for (const incl of [false, true]) {
    test(`L1: a panels burst saved with $12,000.00 and deliverables ${label} keeps $12,000.00 on a no-edit Apply (${incl ? "fee-inclusive" : "fee on top"})`, () => {
      const saved = [oohLine([{ budget: "$12,000.00", buyAmount: "$1,500.00", ...extra, startDate: "2026-03-08", endDate: "2026-03-21" }], incl)]
      const rows = ooh.open(saved)
      // The grid's money is what Apply saves.
      assert.equal(Math.round(expertRowBudget(rows[0], WEEK_KEYS, FEE) * 100), 1_200_000)
      const expected = [[1_200_000, 0, "", "2026-03-08", "2026-03-21"]]
      assert.deepEqual(read(ooh.map(rows)[0]), expected, "pure mapper")
      const [line] = ooh.apply(ooh.open(saved), saved)
      assert.deepEqual(read(line), expected, "round trip")
      assert.equal(cents(line.bursts[0].buyAmount), 150_000)
    })
  }
}

test("L1: an edited panels span saved without deliverables is priced from the grid", () => {
  const saved = [oohLine([{ budget: "$12,000.00", buyAmount: "$1,500.00", calculatedValue: 0, startDate: "2026-03-08", endDate: "2026-03-21" }])]
  const rows = ooh.open(saved)
  rows[0].mergedWeekSpans[0].totalQty = 8
  assert.deepEqual(read(ooh.apply(rows, saved)[0]), [[1_200_000, 8, "", "2026-03-08", "2026-03-21"]])
})

// --- L2 -------------------------------------------------------------------

/**
 * A paid burst in week 1, a paid burst over weeks 1 to 3 (the import spreads
 * it into week cells, it cannot be a span beside week 1's), and a bonus span
 * over weeks 3 and 4: one group. The mapper writes spans first, so the bonus
 * span's burst sits where the saved list has the spread paid burst.
 */
const paidAndBonus = () => [
  oohLine([
    { budget: "$6,000.00", buyAmount: "$1,500.00", calculatedValue: 4, startDate: "2026-03-01", endDate: "2026-03-07" },
    { budget: "$9,000.00", buyAmount: "$1,500.00", calculatedValue: 6, startDate: "2026-03-01", endDate: "2026-03-21" },
    { budget: "0", buyAmount: "0", calculatedValue: 3, buyType: "bonus", startDate: "2026-03-15", endDate: "2026-03-28" },
  ]),
]

test("L2: a paid burst sharing a group with a bonus span stays paid, and the bonus burst keeps its label", () => {
  const saved = paidAndBonus()
  const [line] = ooh.apply(ooh.open(saved), saved)
  assert.deepEqual(read(line), [
    [600_000, 4, "", "2026-03-01", "2026-03-07"],
    [900_000, 6, "", "2026-03-01", "2026-03-21"],
    [0, 3, "bonus", "2026-03-15", "2026-03-28"],
  ])
  // The card's money counts both paid bursts (a burst labelled bonus would be $0).
  assert.equal(lineTotals(line, { feePct: 0 }).mediaCents, 1_500_000)
})

test("L2: a bonus burst first in a group keeps its label; the paid burst after it has none", () => {
  const saved = [
    oohLine([
      { budget: "$6,000.00", buyAmount: "$1,500.00", calculatedValue: 4, startDate: "2026-03-01", endDate: "2026-03-07" },
      { budget: "0", buyAmount: "0", calculatedValue: 3, buyType: "bonus", startDate: "2026-03-01", endDate: "2026-03-14" },
    ]),
  ]
  const [line] = ooh.apply(ooh.open(saved), saved)
  assert.deepEqual(read(line), [
    [600_000, 4, "", "2026-03-01", "2026-03-07"],
    [0, 3, "bonus", "2026-03-01", "2026-03-14"],
  ])
})
