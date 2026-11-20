import "@/lib/testing/bothZones"
/**
 * C-361 (V87 A) what remains, and C-368, pinned on Radio (the six channels
 * share the import). Every case: untouched, Apply gives every burst back as
 * saved and the grid's money is the saved budget. The pins are today's
 * behaviour once the group is edited; each flips when its case is fixed.
 *
 * - A burst entirely under a span (week cell or day cells): no week is left
 *   outside the span, so the import keeps the old spread and the share sits
 *   under the span.
 * - A span the import makes later over a week that already holds a burst:
 *   the earlier burst's share sits under the new span.
 * - C-368: a burst spread into a week that holds day cells: the grid shows
 *   the week cell, Apply writes the day cells.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { computeLoadedDeliverables } from "@/lib/mediaplan/deliverableBudget"
import * as M from "@/lib/mediaplan/expertChannelMappings"
import * as S from "@/lib/mediaplan/expertModeSwitch"
import { expertRowBudget } from "@/lib/mediaplan/expertRowCost"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

const START = new Date(2026, 2, 1)
const END = new Date(2026, 2, 28)
const COLS = buildWeeklyGanttColumnsFromCampaign(START, END)
const KEYS = COLS.map((c) => c.weekKey)
const FEE = 12.5

/** A fee-inclusive Radio spots line at $650.00, 12.5%: spots = budget x 0.875 / 650, rounded. */
function radioLine(flights: ReadonlyArray<readonly [budget: string, startDate: string, endDate: string]>) {
  return [
    {
      buyType: "spots",
      budgetIncludesFees: true,
      clientPaysForMedia: false,
      fixedCostMedia: false,
      noadserving: false,
      station: "3AW",
      line_item_id: "r",
      lineItemId: "r",
      line_item: 1,
      lineItem: 1,
      bursts: flights.map(([budget, startDate, endDate]) => {
        const b = { budget, buyAmount: "$650.00" }
        return { ...b, calculatedValue: computeLoadedDeliverables("spots", b, true, FEE), startDate, endDate }
      }),
    },
  ]
}
const open = (saved: any[]) => M.mapStandardRadioLineItemsToExpertRows(saved, COLS, START, END, { feePct: FEE }) as any[]
const apply = (rows: any[], saved: any[]) =>
  S.mergeRadioStandardFromExpertWithPrevious(
    M.mapRadioExpertRowsToStandardLineItems(rows, COLS, START, END, { feePctRadio: FEE, budgetIncludesFees: true }),
    saved
  ) as any[]
const cents = (n: number) => Math.round(n * 100)
const savedCents = (line: any) => line.bursts.reduce((c: number, b: any) => c + cents(parseBurstMoney(b.budget)), 0)
const grid = (row: any) => cents(expertRowBudget(row, KEYS, FEE))

function untouchedIsExact(saved: any[]) {
  const rows = open(saved)
  const [line] = apply(rows, saved)
  const each = (l: any) => l.bursts.map((b: any) => cents(parseBurstMoney(b.budget))).sort((x: number, y: number) => x - y)
  assert.deepEqual(each(line), each(saved[0]), "untouched: every burst as saved")
  assert.equal(grid(rows[0]), savedCents(saved[0]), "untouched: the grid shows the saved budget")
  return rows
}

for (const [shape, second] of [
  ["a week cell", ["$2,600.00", "2026-03-08", "2026-03-14"]],
  ["day cells", ["$2,600.00", "2026-03-09", "2026-03-11"]],
] as const) {
  test(`C-361 remains: a burst entirely under a span keeps the old spread (${shape})`, () => {
    // 16 spots Mar 1 to 21 (a span over weeks 1 to 3); 4 spots inside week 2.
    const saved = radioLine([["$12,000.00", "2026-03-01", "2026-03-21"], second])
    const rows = untouchedIsExact(saved)
    const hidden =
      Number(rows[0].weeklyValues["2026-03-08"] || 0) +
      Object.values<unknown>(rows[0].dailyValues ?? {}).reduce<number>((q, v) => q + Number(v || 0), 0)
    assert.equal(hidden, 4, "the 4 spots sit under the span")
    // One spot added to the span: the grid counts 16 + 1 + 4 = 21 spots
    // ($13,650.00 / 0.875 = $15,600.00); Apply writes the span's 17
    // ($11,050.00 / 0.875 = $12,628.57).
    rows[0].mergedWeekSpans[0].totalQty += 1
    assert.deepEqual([grid(rows[0]), savedCents(apply(rows, saved)[0])], [1_560_000, 1_262_857])
  })
}

test("C-361 remains: a span the import makes later covers a week an earlier burst holds", () => {
  // 10 spots Mar 1 to 14 (span, weeks 1 and 2); 7 spots Mar 8 to 21 overlap it
  // and open in week 3; 7 spots Mar 15 to 28 conflict with no span, so they
  // open as a span over weeks 3 and 4, on top of the 7 in week 3.
  const saved = radioLine([
    ["$7,777.00", "2026-03-01", "2026-03-14"],
    ["$5,200.00", "2026-03-08", "2026-03-21"],
    ["$5,200.00", "2026-03-15", "2026-03-28"],
  ])
  const rows = untouchedIsExact(saved)
  assert.deepEqual(
    [rows[0].weeklyValues["2026-03-15"], rows[0].mergedWeekSpans.map((sp: any) => [sp.startWeekKey, sp.endWeekKey])],
    [7, [["2026-03-01", "2026-03-08"], ["2026-03-15", "2026-03-22"]]]
  )
  // One spot added to the second span: the grid counts 10 + 7 + 8 = 25 spots
  // ($16,250.00 / 0.875 = $18,571.43); Apply writes 10 + 8 = 18 ($13,371.43).
  rows[0].mergedWeekSpans[1].totalQty += 1
  assert.deepEqual([grid(rows[0]), savedCents(apply(rows, saved)[0])], [1_857_143, 1_337_143])
})

test("C-368: a burst spread into a week with day cells: the grid counts the week cell, Apply writes the days", () => {
  // 10 spots Mar 1 to 14 (span); 4 spots Mar 16 to 18 (day cells in week 3);
  // 7 spots Mar 8 to 21 overlap the span and open in week 3's week cell.
  const saved = radioLine([
    ["$7,777.00", "2026-03-01", "2026-03-14"],
    ["$2,600.00", "2026-03-16", "2026-03-18"],
    ["$5,200.00", "2026-03-08", "2026-03-21"],
  ])
  const rows = untouchedIsExact(saved)
  assert.equal(rows[0].weeklyValues["2026-03-15"], 7)
  assert.equal(Object.keys(rows[0].dailyValues).length, 3)
  // One spot added on Mar 16: the grid counts 10 + 7 + 5 = 22 spots
  // ($14,300.00 / 0.875 = $16,342.86); Apply writes 10 + 5 = 15 ($11,142.85
  // over three bursts, each rounded).
  rows[0].dailyValues["2026-03-16"] += 1
  assert.deepEqual([grid(rows[0]), savedCents(apply(rows, saved)[0])], [1_634_286, 1_114_285])
})

/**
 * Where an overlapping burst opens, on each of the six channels (fee on top,
 * no fee). Spots or panels at $600.00, $4,200.00 = 7.
 */
const SIX = [
  ["OOH", M.mapStandardOohLineItemsToExpertRows, "panels"],
  ["Radio", M.mapStandardRadioLineItemsToExpertRows, "spots"],
  ["Cinema", M.mapStandardCinemaLineItemsToExpertRows, "spots"],
  ["Television", M.mapStandardTvLineItemsToExpertRows, "spots"],
  ["BVOD", M.mapStandardBvodLineItemsToExpertRows, "spots"],
  ["Digital Audio", M.mapStandardDigiAudioLineItemsToExpertRows, "spots"],
] as const

function sixLine(buyType: string, flights: ReadonlyArray<readonly [qty: number, startDate: string, endDate: string]>) {
  return {
    buyType,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    fixedCostMedia: false,
    noadserving: false,
    line_item_id: "x",
    lineItemId: "x",
    line_item: 1,
    lineItem: 1,
    bursts: flights.map(([qty, startDate, endDate]) => ({
      budget: `$${(qty * 600).toFixed(2)}`,
      buyAmount: "$600.00",
      calculatedValue: qty,
      startDate,
      endDate,
    })),
  }
}
const cellsOf = (row: any) => KEYS.map((k) => row.weeklyValues[k])

for (const [name, toExpert, buyType] of SIX) {
  for (const qty of [7, 7.4]) {
    test(`${name}: a burst of ${qty} around a one-week span opens in the weeks either side, rounded, the earliest taking the remainder`, () => {
      // 5 in week 2 (a span); 7 (7.4 rounds to 7) over Mar 1 to 21: weeks 1 and 3, 4 then 3.
      const [row] = (toExpert as (...a: any[]) => any[])(
        [sixLine(buyType, [[5, "2026-03-08", "2026-03-14"], [qty, "2026-03-01", "2026-03-21"]])],
        COLS,
        START,
        END,
        { feePct: 0 }
      )
      assert.deepEqual(cellsOf(row), [4, "", 3, ""])
      assert.deepEqual(row.mergedWeekSpans.map((sp: any) => [sp.startWeekKey, sp.endWeekKey, sp.totalQty]), [["2026-03-08", "2026-03-08", 5]])
    })
  }

  test(`${name}: a burst that meets the second of two spans at its first week opens before it`, () => {
    // 5 in week 1 (a span), 5 over weeks 3 and 4 (a span); 7 over Mar 8 to 21
    // touches week 2 and the second span's first week: all 7 in week 2.
    const [row] = (toExpert as (...a: any[]) => any[])(
      [sixLine(buyType, [[5, "2026-03-01", "2026-03-07"], [5, "2026-03-15", "2026-03-28"], [7, "2026-03-08", "2026-03-21"]])],
      COLS,
      START,
      END,
      { feePct: 0 }
    )
    assert.deepEqual(cellsOf(row), ["", 7, "", ""])
  })
}

test("C-361 remains: a two-week burst entirely under a span keeps the old spread over both weeks", () => {
  // 20 over Mar 1 to 28 (a span over all four weeks); 7 over Mar 8 to 21 sit
  // under it as 4 and 3, as before C361.
  const [row] = M.mapStandardRadioLineItemsToExpertRows(
    [sixLine("spots", [[20, "2026-03-01", "2026-03-28"], [7, "2026-03-08", "2026-03-21"]])] as any[],
    COLS,
    START,
    END,
    { feePct: 0 }
  ) as any[]
  assert.deepEqual(cellsOf(row), ["", 4, 3, ""])
})

test("an edited day-cell group beside a carried span: the grid's money is what Apply saves", () => {
  // 4 spots Mar 2 to 4 (day cells, week 1) and 10 Mar 22 to 28 (a span, its
  // own group). One spot added on Mar 2: the span stays carried at
  // $7,777.00; the days are 5 spots, $3,250.00 / 0.875 = $3,714.29, which
  // Apply writes as two bursts each rounded to the cent ($2,228.57 + $1,485.71).
  const saved = radioLine([
    ["$2,600.00", "2026-03-02", "2026-03-04"],
    ["$7,777.00", "2026-03-22", "2026-03-28"],
  ])
  const rows = untouchedIsExact(saved)
  rows[0].dailyValues["2026-03-02"] += 1
  const [line] = apply(rows, saved)
  assert.equal(grid(rows[0]), 1_149_129)
  assert.ok(Math.abs(savedCents(line) - grid(rows[0])) <= line.bursts.length, `Apply ${savedCents(line)}`)
})
