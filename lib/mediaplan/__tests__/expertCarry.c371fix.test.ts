import "@/lib/testing/bothZones"
/**
 * C371fix (review F1, F2). F1: a line added on the card holds one blank $0
 * burst over the campaign (Production: cost 0, amount 0). Filled in the grid,
 * Apply writes the typed bursts only, so publish finds no overlapping bursts;
 * untouched it comes back as saved. F2: on a lump-sum line (V105 A) an edit in
 * a week under the saved burst's dates, not week 1, prices the line from the
 * grid instead of writing the saved burst beside the new one. Sunday and
 * Monday grids, both zones.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { format } from "date-fns"

import { findOverlappingBursts } from "@/lib/mediaplan/burstOverlap"
import { mapRowsWithCarry } from "@/lib/mediaplan/expertCarry"
import * as M from "@/lib/mediaplan/expertChannelMappings"
import * as S from "@/lib/mediaplan/expertModeSwitch"
import { expertRowCostSplit } from "@/lib/mediaplan/expertRowCost"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import { toCents } from "@/lib/money/cents"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

type AnyFn = (...args: any[]) => any
type Channel = { name: string; buyType: string; feeKey: string; toExpert: AnyFn; fromExpert: AnyFn; merge: AnyFn; toExpertFee?: boolean }
const RADIO: Channel = { name: "Radio", buyType: "spots", feeKey: "feePctRadio", toExpert: M.mapStandardRadioLineItemsToExpertRows, fromExpert: M.mapRadioExpertRowsToStandardLineItems, merge: S.mergeRadioStandardFromExpertWithPrevious, toExpertFee: true }
const SEARCH: Channel = { name: "Search", buyType: "cpc", feeKey: "feePctSearch", toExpert: M.mapStandardSearchLineItemsToExpertRows, fromExpert: M.mapSearchExpertRowsToStandardLineItems, merge: S.mergeSearchStandardFromExpertWithPrevious }
const NEWSPAPER: Channel = { name: "Newspaper", buyType: "insertions", feeKey: "feePctNewspaper", toExpert: M.mapStandardNewspaperLineItemsToExpertRows, fromExpert: M.mapNewspaperExpertRowsToStandardLineItems, merge: S.mergeNewspaperStandardFromExpertWithPrevious }
const PRODUCTION: Channel = { name: "Production", buyType: "production", feeKey: "feePctProduction", toExpert: M.mapStandardProductionLineItemsToExpertRows, fromExpert: M.mapProductionExpertRowsToStandardLineItems, merge: S.mergeProductionStandardFromExpertWithPrevious }
const TV: Channel = { name: "Television", buyType: "package", feeKey: "feePctTelevision", toExpert: M.mapStandardTvLineItemsToExpertRows, fromExpert: M.mapTvExpertRowsToStandardLineItems, merge: S.mergeTelevisionStandardFromExpertWithPrevious }

const START = new Date(2026, 2, 1)
const END = new Date(2026, 2, 28)
const ids = { line_item_id: "c371fix", lineItemId: "c371fix", line_item: 1, lineItem: 1 }
const day = (d: unknown) => (d instanceof Date ? format(d, "yyyy-MM-dd") : String(d ?? "").slice(0, 10))
const money = (b: any) => ("cost" in b && !String(b.budget ?? "").trim() ? Number(b.cost) * Number(b.amount) : parseBurstMoney(b.budget))
const cents = (line: any) => (line.bursts ?? []).reduce((s: number, b: any) => s + toCents(money(b)), 0)

/** The card's new line: one blank burst over the campaign (the container default burst; Production's is cost 0, amount 0). */
const newLine = (ch: Channel) =>
  ch === PRODUCTION
    ? { mediaType: "Production", publisher: "", description: "", market: "", unitRate: 0, buyType: "production", ...ids, bursts: [{ cost: 0, amount: 0, startDate: START, endDate: END }] }
    : { buyType: "", budgetIncludesFees: false, clientPaysForMedia: false, fixedCostMedia: false, noadserving: false, ...ids, bursts: [{ budget: "", buyAmount: "", calculatedValue: 0, startDate: "2026-03-01", endDate: "2026-03-28" }] }

function run(ch: Channel, saved: any, start: Date, end: Date, wso: 0 | 1, edit?: (row: any, keys: string[]) => void) {
  const cols = buildWeeklyGanttColumnsFromCampaign(start, end, wso)
  const keys = cols.map((c) => c.weekKey)
  const rows = ch.toExpert([saved], cols, start, end, ...(ch.toExpertFee ? [{ feePct: 0 }] : []))
  edit?.(rows[0], keys)
  const grid = toCents(expertRowCostSplit(rows[0], keys, 0).raw)
  const applied = ch.merge(ch.fromExpert(rows, cols, start, end, { [ch.feeKey]: 0, budgetIncludesFees: false }), [saved])[0]
  return { grid, applied }
}

for (const wso of [0, 1] as const) {
  const grid = wso ? "Monday" : "Sunday"
  // Week 2 typed (the week-cell imports open the blank burst as a 0 span, which the planner unmerges first), or the span's total typed.
  const edits = [
    { name: "filled in week 2", qty: 3, edit: (row: any, keys: string[]) => ((row.mergedWeekSpans = []), (row.weeklyValues[keys[1]!] = 3)) },
    { name: "its 0 span filled", qty: 3, edit: (row: any) => (row.mergedWeekSpans[0].totalQty = 3), spanOnly: true },
  ]
  for (const ch of [RADIO, SEARCH, NEWSPAPER, PRODUCTION]) {
    test(`${ch.name}, ${grid} grid: a new card line comes back as saved untouched (C371fix F1)`, () => {
      const saved = newLine(ch)
      assert.deepEqual(run(ch, saved, START, END, wso).applied.bursts, saved.bursts)
    })
    for (const e of edits) {
      if (e.spanOnly && ch !== SEARCH && ch !== NEWSPAPER) continue
      test(`${ch.name}, ${grid} grid: a new card line ${e.name}: Apply writes the typed burst only, with no overlap, grid = Apply (C371fix F1)`, () => {
        const filled = run(ch, newLine(ch), START, END, wso, (row, keys) => {
          row.buyType = ch.buyType
          row.unitRate = 100
          e.edit(row, keys)
        })
        const bursts = filled.applied.bursts as any[]
        assert.deepEqual(findOverlappingBursts(bursts), [])
        assert.ok(bursts.length >= 1 && bursts.every((b) => money(b) > 0), JSON.stringify(bursts))
        assert.equal(filled.grid, e.qty * 10_000)
        assert.equal(cents(filled.applied), filled.grid)
      })
    }
  }

  test(`Radio, ${grid} grid: a blank burst under a saved paid burst comes back as saved untouched: only a burst the grid wrote counts, not a carried one (C371fix F1)`, () => {
    const saved = { buyType: "spots", budgetIncludesFees: false, clientPaysForMedia: false, fixedCostMedia: false, noadserving: false, ...ids, bursts: [{ budget: "$1,950.00", buyAmount: "$650.00", calculatedValue: 3, startDate: "2026-03-01", endDate: "2026-03-07" }, { budget: "", buyAmount: "", calculatedValue: 0, startDate: "2026-03-01", endDate: "2026-03-28" }] }
    assert.deepEqual(run(RADIO, saved, START, END, wso).applied.bursts.map((b: any) => [money(b), day(b.startDate), day(b.endDate)]), [[1950, "2026-03-01", "2026-03-07"], [0, "2026-03-01", "2026-03-28"]])
  })

  test(`Television package lump line, ${grid} grid: an edit in a week under the saved burst, not week 1, is priced from the grid with no overlap (C371fix F2, PENFOLD018 31931 shape)`, () => {
    const start = new Date(2026, 2, 1)
    const end = new Date(2026, 5, 28)
    const saved = { buyType: "package", budgetIncludesFees: false, clientPaysForMedia: false, fixedCostMedia: false, noadserving: false, ...ids, bursts: [{ budget: "$150,000.00", buyAmount: "$0.00", calculatedValue: 0, startDate: "2026-04-12", endDate: "2026-05-09" }] }
    const { grid: money, applied } = run(TV, saved, start, end, wso, (row, keys) => {
      const k = keys.find((w) => w > "2026-04-18" && w <= "2026-04-20")!
      row.weeklyValues[k] = 2
    })
    assert.deepEqual(findOverlappingBursts(applied.bursts), [])
    assert.equal(cents(applied), money)
  })

  test(`Television package lump line, ${grid} grid: an edit in a week the saved burst does not touch keeps the saved burst as saved beside the new one (C371fix F2, review N13)`, () => {
    const start = new Date(2026, 2, 1)
    const end = new Date(2026, 5, 28)
    const own = { budget: "$150,000.00", buyAmount: "$0.00", calculatedValue: 0, startDate: "2026-04-12", endDate: "2026-05-09" }
    const saved = { buyType: "package", budgetIncludesFees: false, clientPaysForMedia: false, fixedCostMedia: false, noadserving: false, ...ids, bursts: [own] }
    const { grid: money, applied } = run(TV, saved, start, end, wso, (row, keys) => {
      row.weeklyValues[keys.find((w) => w > "2026-06-05" && w <= "2026-06-08")!] = 2
    })
    assert.deepEqual(applied.bursts[0], own)
    assert.equal(applied.bursts.length, 2)
    assert.deepEqual(findOverlappingBursts(applied.bursts), [])
    assert.equal(cents(applied), money)
  })
}

// The rule on its own: only a $0 burst with no quantity is left out, and only when a written burst shares a day with it.
test("A burst the grid cannot place is left out only when it is $0 with no quantity and a burst the grid wrote shares a day with it (C371fix F1)", () => {
  const cols = buildWeeklyGanttColumnsFromCampaign(START, END, 0)
  const typed = { budget: "$300.00", buyAmount: "$100.00", calculatedValue: 3, startDate: "2026-03-01", endDate: "2026-03-21" }
  const unplaced = (asSaved: Record<string, unknown>) => ({ budget: asSaved.budget, buyAmount: asSaved.buyAmount, calculatedValue: asSaved.calculatedValue, amount: asSaved.amount, takesGridQty: false, startYmd: String(asSaved.startDate), endYmd: String(asSaved.endDate), asSaved })
  const apply = (...saved: Record<string, unknown>[]) => {
    const row = { weeklyValues: {}, expertCarry: { unitRate: 0, buyType: "", budgetIncludesFees: false, groups: [], unplaced: saved.map(unplaced) } }
    return mapRowsWithCarry([row], cols, () => ({ bursts: [typed] }))[0]!.bursts
  }
  const blankUnder = { budget: "", buyAmount: "", calculatedValue: 0, startDate: "2026-03-15", endDate: "2026-03-28" }
  assert.deepEqual(apply(blankUnder), [typed])
  for (const kept of [
    { ...blankUnder, calculatedValue: 5 },
    { cost: 0, amount: 2, budget: "", calculatedValue: 0, startDate: "2026-03-15", endDate: "2026-03-28" },
    { ...blankUnder, budget: "$50.00" },
    { ...blankUnder, startDate: "2026-03-22" },
  ]) assert.deepEqual(apply(kept), [typed, kept])
})
