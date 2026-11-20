import "@/lib/testing/bothZones"
/**
 * C361b: V93 A (C-361 case 2) and V94 A (C-368), on the six channels that
 * share the import (OOH, Radio, Cinema, Television, BVOD, Digital Audio).
 *
 * - V93 A: a burst can open as a span only when none of its weeks is taken,
 *   on the grid's own rule (`buildWeekBlockedPredicate`): a span, a non-zero
 *   week cell, or any non-blank day value (0 included).
 * - V94 A: a burst that cannot be a span spreads only into weeks no span
 *   covers and no day cells hold; with no such week, the spread before
 *   (weeks no span covers, else every week it touches).
 *
 * The round trip (`expertApplyRoundTrip.c342.test.ts`) proves untouched lines
 * exact and edited groups priced as the grid shows on every buy type and fee
 * case; this file pins where each burst opens.
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
const cents = (n: number) => Math.round(n * 100)

const SIX = [
  ["OOH", M.mapStandardOohLineItemsToExpertRows, "panels"],
  ["Radio", M.mapStandardRadioLineItemsToExpertRows, "spots"],
  ["Cinema", M.mapStandardCinemaLineItemsToExpertRows, "spots"],
  ["Television", M.mapStandardTvLineItemsToExpertRows, "spots"],
  ["BVOD", M.mapStandardBvodLineItemsToExpertRows, "spots"],
  ["Digital Audio", M.mapStandardDigiAudioLineItemsToExpertRows, "spots"],
] as const

type Flight = readonly [qty: number, startDate: string, endDate: string, buyType?: string]

/** A fee-on-top line at $600.00 a spot or panel. */
function line(buyType: string, flights: readonly Flight[]) {
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
    bursts: flights.map(([qty, startDate, endDate, bt]) => ({
      ...(bt ? { buyType: bt } : {}),
      budget: bt === "bonus" ? "$0.00" : `$${(qty * 600).toFixed(2)}`,
      buyAmount: bt === "bonus" ? "$0.00" : "$600.00",
      calculatedValue: qty,
      startDate,
      endDate,
    })),
  }
}
const openWith = (toExpert: unknown, l: unknown) =>
  (toExpert as (...a: any[]) => any[])([l], COLS, START, END, { feePct: 0 })[0]
const cellsOf = (row: any) => KEYS.map((k) => row.weeklyValues[k])
const spansOf = (row: any) => (row.mergedWeekSpans ?? []).map((sp: any) => [sp.startWeekKey, sp.endWeekKey, sp.totalQty])
const daysOf = (row: any) => Object.fromEntries(Object.entries(row.dailyValues ?? {}).filter(([, v]) => v !== "" && v !== undefined))

for (const [name, toExpert, buyType] of SIX) {
  test(`${name}: Monday to Sunday weekly bursts on a Sunday grid open as one span and week cells (V93 A)`, () => {
    // 7 Mar 2 to 8 (a span over weeks 1 and 2); 7 Mar 9 to 15 overlap it, all
    // in week 3; 7 Mar 16 to 22 touch week 3, which holds a cell: no span, 4
    // and 3 over weeks 3 and 4.
    const row = openWith(toExpert, line(buyType, [[7, "2026-03-02", "2026-03-08"], [7, "2026-03-09", "2026-03-15"], [7, "2026-03-16", "2026-03-22"]]))
    assert.deepEqual(spansOf(row), [["2026-03-01", "2026-03-08", 7]])
    assert.deepEqual(cellsOf(row), ["", "", 11, 3])
  })

  test(`${name}: day cells in a week stop a burst opening as a span over it; it opens either side (V93 A, V94 A)`, () => {
    // 3 on Mar 9 to 11 (day cells, week 2); 7 over Mar 1 to 21: 4 in week 1, 3 in week 3.
    const row = openWith(toExpert, line(buyType, [[3, "2026-03-09", "2026-03-11"], [7, "2026-03-01", "2026-03-21"]]))
    assert.deepEqual(spansOf(row), [])
    assert.deepEqual(cellsOf(row), [4, "", 3, ""])
    assert.deepEqual(daysOf(row), { "2026-03-09": 1, "2026-03-10": 1, "2026-03-11": 1 })
  })

  test(`${name}: a span in one week and day cells in the next leave the third week for the burst (V94 A)`, () => {
    // 5 in week 1 (a span), 3 on Mar 9 to 11 (days); 7 over Mar 1 to 21: all 7 in week 3.
    const row = openWith(toExpert, line(buyType, [[5, "2026-03-01", "2026-03-07"], [3, "2026-03-09", "2026-03-11"], [7, "2026-03-01", "2026-03-21"]]))
    assert.deepEqual(spansOf(row), [["2026-03-01", "2026-03-01", 5]])
    assert.deepEqual(cellsOf(row), ["", "", 7, ""])
  })

  test(`${name}: a burst over weeks that hold nothing still opens as a span`, () => {
    // 7 Mar 1 to 7 (a span); 7 Mar 15 to 28 touches no taken week: a second span.
    const row = openWith(toExpert, line(buyType, [[7, "2026-03-01", "2026-03-07"], [7, "2026-03-15", "2026-03-28"]]))
    assert.deepEqual(spansOf(row), [["2026-03-01", "2026-03-01", 7], ["2026-03-15", "2026-03-22", 7]])
    assert.deepEqual(cellsOf(row), ["", "", "", ""])
  })
}

test("OOH: a day value of 0 counts as taken, as in the grid's span rule (V93 A, V94 A)", () => {
  // A bonus burst of 0 on Mar 9 to 11 leaves day cells of 0 in week 2; 7 paid
  // panels over Mar 1 to 21 cannot be a span over them: 4 in week 1, 3 in week 3.
  const row = openWith(M.mapStandardOohLineItemsToExpertRows, line("panels", [[0, "2026-03-09", "2026-03-11", "bonus"], [7, "2026-03-01", "2026-03-21"]]))
  assert.deepEqual(daysOf(row), { "2026-03-09": 0, "2026-03-10": 0, "2026-03-11": 0 })
  assert.deepEqual(spansOf(row), [])
  assert.deepEqual(cellsOf(row), [4, "", 3, ""])
})

test("OOH: a week cell of 0 does not count as taken, as in the grid's span rule (V93 A)", () => {
  // 5 paid Mar 1 to 14 (a span); a bonus 0 over Mar 8 to 21 overlaps it and
  // leaves 0 in week 3; 7 paid Mar 15 to 28 still open as a span over weeks 3 and 4.
  const row = openWith(
    M.mapStandardOohLineItemsToExpertRows,
    line("panels", [[5, "2026-03-01", "2026-03-14"], [0, "2026-03-08", "2026-03-21", "bonus"], [7, "2026-03-15", "2026-03-28"]])
  )
  assert.equal(row.weeklyValues["2026-03-15"], 0)
  assert.deepEqual(spansOf(row), [["2026-03-01", "2026-03-08", 5], ["2026-03-15", "2026-03-22", 7]])
})

test("OOH: a bonus burst that cannot be a span opens as week cells with no buy type; the grid's money is what Apply saves", () => {
  // 3 paid panels Mar 9 to 11 (days); a bonus 3 over Mar 1 to 21 cannot be a
  // span over them (before C361b it was a bonus span hiding the paid days):
  // 2 in week 1, 1 in week 3, as week cells. Untouched: every burst as saved.
  // Edited: a week cell is priced at the line's rate (C-361 note, older than
  // C361b), and the grid shows the same money.
  const saved = [line("panels", [[3, "2026-03-09", "2026-03-11"], [3, "2026-03-01", "2026-03-21", "bonus"]])]
  const row = openWith(M.mapStandardOohLineItemsToExpertRows, saved[0])
  assert.deepEqual([spansOf(row), cellsOf(row)], [[], [2, "", 1, ""]])
  const apply = () =>
    S.mergeOohStandardFromExpertWithPrevious(M.mapOohExpertRowsToStandardLineItems([row], COLS, START, END, { feePctOoh: 0 }), saved as any[]) as any[]
  const each = (l: any) => l.bursts.map((b: any) => cents(parseBurstMoney(b.budget))).sort((x: number, y: number) => x - y)
  assert.deepEqual(each(apply()[0]), each(saved[0]))
  row.weeklyValues["2026-03-01"] = 3
  const grid = cents(expertRowBudget(row, KEYS, 0))
  const saves = apply()[0].bursts.reduce((c: number, b: any) => c + cents(parseBurstMoney(b.budget)), 0)
  // 3 paid days + 3 + 1 in week cells = 7 panels x $600.00.
  assert.deepEqual([grid, saves], [420_000, 420_000])
})

/** A fee-inclusive Radio spots line at $650.00, 12.5% (as `expertCarry.c361.test.ts`). */
function radioLine(flights: ReadonlyArray<readonly [budget: string, startDate: string, endDate: string]>): any[] {
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
        return { ...b, calculatedValue: computeLoadedDeliverables("spots", b, true, 12.5), startDate, endDate }
      }),
    },
  ]
}

test("what remains: a sub-week burst whose days land in a week that already holds a week cell", () => {
  // The live remainder after C361b (10 OOH lines). 10 spots Mar 1 to 14 (a
  // span); 7 spots Mar 8 to 21 open in week 3; then 4 spots Mar 16 to 18 open
  // as day cells in week 3, beside the week cell. The import's day path does
  // not look at week cells. Untouched exact; edited, the grid counts the week
  // cell and Apply writes the days (C-368, the reverse order).
  const saved = radioLine([
    ["$7,777.00", "2026-03-01", "2026-03-14"],
    ["$5,200.00", "2026-03-08", "2026-03-21"],
    ["$2,600.00", "2026-03-16", "2026-03-18"],
  ])
  const rows = M.mapStandardRadioLineItemsToExpertRows(saved, COLS, START, END, { feePct: 12.5 }) as any[]
  const apply = () =>
    S.mergeRadioStandardFromExpertWithPrevious(
      M.mapRadioExpertRowsToStandardLineItems(rows, COLS, START, END, { feePctRadio: 12.5, budgetIncludesFees: true }),
      saved
    ) as any[]
  const total = (l: any) => l.bursts.reduce((c: number, b: any) => c + cents(parseBurstMoney(b.budget)), 0)
  assert.deepEqual([rows[0].weeklyValues["2026-03-15"], Object.keys(daysOf(rows[0])).length], [7, 3])
  assert.equal(total(apply()[0]), 1_557_700)
  rows[0].dailyValues["2026-03-16"] += 1
  // Grid 10 + 7 + 5 = 22 spots ($16,342.86); Apply 10 + 5 = 15 ($11,142.85).
  assert.deepEqual([cents(expertRowBudget(rows[0], KEYS, 12.5)), total(apply()[0])], [1_634_286, 1_114_285])
})
