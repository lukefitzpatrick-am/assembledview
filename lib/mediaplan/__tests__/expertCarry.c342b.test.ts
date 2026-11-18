import "@/lib/testing/bothZones"
/**
 * C342B (V66 B): what counts as an edit for the expert grid's carry, through
 * the mappers the containers run (open, Apply, merge).
 *
 * - Untouched is read from the values: typing a cell's own number back is no
 *   edit; the Budget Includes Fees box, the buy type, a span's extent, a day
 *   cell are.
 * - A duplicated row keeps the saved money of the row it copies.
 * - A burst the import spreads over several weeks is one group with the
 *   bursts it shares weeks with: carried whole, priced from the grid whole.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { computeLoadedDeliverables } from "@/lib/mediaplan/deliverableBudget"
import * as M from "@/lib/mediaplan/expertChannelMappings"
import * as S from "@/lib/mediaplan/expertModeSwitch"
import { duplicateExpertRow } from "@/lib/mediaplan/expertRowLifecycle"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

const START = new Date(2026, 2, 1)
const END = new Date(2026, 2, 28)
const COLS = buildWeeklyGanttColumnsFromCampaign(START, END)
const FEE = 12.5

function cpmLine(id: string, bursts: Array<{ budget: string; startDate: string; endDate: string }>, incl = true) {
  return {
    buyType: "cpm",
    budgetIncludesFees: incl,
    clientPaysForMedia: false,
    fixedCostMedia: false,
    noadserving: false,
    line_item_id: id,
    lineItemId: id,
    line_item: 1,
    lineItem: 1,
    platform: "Google",
    bursts: bursts.map((b) => {
      const burst = { budget: b.budget, buyAmount: "$15.00" }
      return { ...burst, calculatedValue: computeLoadedDeliverables("cpm", burst, incl, FEE), startDate: b.startDate, endDate: b.endDate }
    }),
  }
}

const search = {
  open: (saved: any[]) => M.mapStandardSearchLineItemsToExpertRows(saved, COLS, START, END) as any[],
  apply: (rows: any[], saved: any[]) =>
    S.mergeSearchStandardFromExpertWithPrevious(
      M.mapSearchExpertRowsToStandardLineItems(rows, COLS, START, END, { feePctSearch: FEE }),
      saved
    ) as any[],
}

const budgets = (line: any) => line.bursts.map((b: any) => Math.round(parseBurstMoney(b.budget) * 100))
const weekKey = (ymd: string) => [...COLS].reverse().find((c) => c.weekKey <= ymd)!.weekKey

test("typing a cell's own number back is no edit: the saved budget stays", () => {
  const saved = [cpmLine("a", [{ budget: "$7,777.77", startDate: "2026-03-01", endDate: "2026-03-07" }])]
  const rows = search.open(saved)
  const k = weekKey("2026-03-01")
  const was = rows[0].weeklyValues[k]
  rows[0].weeklyValues[k] = ""
  rows[0].weeklyValues[k] = String(was)
  assert.deepEqual(budgets(search.apply(rows, saved)[0]), [777_777])
})

test("ticking Budget Includes Fees off in the grid prices every cell from the grid", () => {
  const saved = [cpmLine("a", [{ budget: "$12,000.00", startDate: "2026-03-01", endDate: "2026-03-07" }])]
  const rows = search.open(saved)
  rows[0].budgetIncludesFees = false
  const [line] = search.apply(rows, saved)
  // 700,000 impressions at CPM $15.00 is $10,500.00, now fee on top.
  assert.deepEqual([budgets(line), line.budgetIncludesFees, line.bursts[0].calculatedValue], [[1_050_000], false, 700_000])
})

test("a changed buy type drops the carry", () => {
  const saved = [cpmLine("a", [{ budget: "$12,000.00", startDate: "2026-03-01", endDate: "2026-03-07" }])]
  const rows = search.open(saved)
  rows[0].buyType = "cpc"
  const [line] = search.apply(rows, saved)
  // The same rate, now per click: 700,000 clicks at $15.00, grossed up at 12.5%.
  assert.deepEqual(budgets(line), [1_200_000_000])
})

test("a span stretched by a week is priced from the grid; the line's other burst stays", () => {
  const saved = [
    cpmLine("a", [
      { budget: "$12,000.00", startDate: "2026-03-01", endDate: "2026-03-07" },
      { budget: "$7,777.77", startDate: "2026-03-08", endDate: "2026-03-21" },
    ]),
  ]
  const rows = search.open(saved)
  const span = rows[0].mergedWeekSpans.find((sp: any) => sp.startWeekKey === weekKey("2026-03-08"))
  assert.ok(span, "the two-week burst opens as a span")
  span.endWeekKey = weekKey("2026-03-22")
  delete span.endYmd
  const [line] = search.apply(rows, saved)
  line.bursts.sort((a: any, b: any) => +a.startDate - +b.startDate)
  const qty = saved[0]!.bursts[1]!.calculatedValue
  const media = (qty / 1000) * 15
  assert.equal(budgets(line)[0], 1_200_000)
  assert.ok(Math.abs(budgets(line)[1] / 100 - media / (1 - FEE / 100)) <= 0.01)
})

test("a day cell edit prices that week from the grid", () => {
  const saved = [cpmLine("a", [{ budget: "$3,000.00", startDate: "2026-03-02", endDate: "2026-03-04" }])]
  const rows = search.open(saved)
  const days = Object.keys(rows[0].dailyValues ?? {})
  assert.ok(days.length > 0, "a three-day burst opens as day cells")
  rows[0].dailyValues[days[0]!] = Number(rows[0].dailyValues[days[0]!]) + 1000
  const [line] = search.apply(rows, saved)
  const total = budgets(line).reduce((a: number, b: number) => a + b, 0)
  const qty = saved[0]!.bursts[0]!.calculatedValue + 1000
  assert.ok(Math.abs(total / 100 - ((qty / 1000) * 15) / (1 - FEE / 100)) <= 0.01 * line.bursts.length)
})

test("a duplicated row keeps the saved money of the row it copies", () => {
  const saved = [cpmLine("a", [{ budget: "$7,777.77", startDate: "2026-03-01", endDate: "2026-03-07" }])]
  const rows = duplicateExpertRow(search.open(saved), 0, () => "dup", (i) => `dup-${i}`)!
  const lines = search.apply(rows, saved)
  assert.deepEqual(lines.map(budgets), [[777_777], [777_777]])
})

test("Radio: a burst spread over weeks beside a span is one group, carried whole and priced whole", () => {
  const radioLine = (bursts: Array<{ budget: string; startDate: string; endDate: string }>) => ({
    ...cpmLine("r", []),
    buyType: "spots",
    station: "3AW",
    bursts: bursts.map((b) => {
      const burst = { budget: b.budget, buyAmount: "$650.00" }
      return { ...burst, calculatedValue: computeLoadedDeliverables("spots", burst, true, FEE), startDate: b.startDate, endDate: b.endDate }
    }),
  })
  // The second burst overlaps the first's span, so the import spreads it over week cells.
  const saved = [
    radioLine([
      { budget: "$7,777.00", startDate: "2026-03-01", endDate: "2026-03-14" },
      { budget: "$5,200.00", startDate: "2026-03-08", endDate: "2026-03-21" },
    ]),
  ]
  const open = () => M.mapStandardRadioLineItemsToExpertRows(saved as any[], COLS, START, END, { feePct: FEE }) as any[]
  const apply = (rows: any[]) =>
    S.mergeRadioStandardFromExpertWithPrevious(
      M.mapRadioExpertRowsToStandardLineItems(rows, COLS, START, END, { feePctRadio: FEE, budgetIncludesFees: true }),
      saved as any
    ) as any[]
  assert.deepEqual(budgets(apply(open())[0]), [777_700, 520_000], "untouched: both bursts as saved")

  const rows = open()
  const k = weekKey("2026-03-15")
  assert.notEqual(rows[0].weeklyValues[k], "", "week 3 holds part of the spread burst")
  rows[0].weeklyValues[k] = Number(rows[0].weeklyValues[k]) + 1
  const [line] = apply(rows)
  const spots = line.bursts.reduce((q: number, b: any) => q + b.calculatedValue, 0)
  // Priced from what the grid shows: the span and the week cells outside it.
  // The spread burst's share in the span's week sits under the span and is
  // not written (C-361, as before this batch).
  const spanned = new Set(rows[0].mergedWeekSpans.flatMap((sp: any) => COLS.map((c) => c.weekKey).filter((w) => sp.startWeekKey <= w && w <= sp.endWeekKey)))
  const shown =
    rows[0].mergedWeekSpans.reduce((q: number, sp: any) => q + sp.totalQty, 0) +
    COLS.filter((c) => !spanned.has(c.weekKey)).reduce((q, c) => q + Number(rows[0].weeklyValues[c.weekKey] || 0), 0)
  assert.equal(spots, shown)
  const total = budgets(line).reduce((a: number, b: number) => a + b, 0) / 100
  assert.ok(Math.abs(total - (spots * 650) / (1 - FEE / 100)) <= 0.01 * line.bursts.length, `group priced whole: ${total}`)
})
