import "@/lib/testing/bothZones"
/**
 * C370fix (V107 A, review F7): the V97 split (a sub-week burst splits a held
 * week cell into day cells first) is skipped on a fixed cost line until V96
 * (C-369). There every priced cell is written at the rate, so the split would
 * add a priced cell. Review probe P6: Radio fixed cost, Sunday and Monday
 * grids, both zones. Kept apart so this guard can be dropped alone.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { format } from "date-fns"

import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"
import * as M from "@/lib/mediaplan/expertChannelMappings"
import * as S from "@/lib/mediaplan/expertModeSwitch"
import { expertRowCostSplit } from "@/lib/mediaplan/expertRowCost"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import { toCents } from "@/lib/money/cents"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

const START = new Date(2026, 2, 1)
const END = new Date(2026, 2, 28)
const day = (d: unknown) => (d instanceof Date ? format(d, "yyyy-MM-dd") : formatBurstDateLocal(String(d ?? "")))
const read = (line: any) =>
  [...(line.bursts ?? [])]
    .map((b: any) => [toCents(parseBurstMoney(b.budget)), Number(b.calculatedValue), `${day(b.startDate)}..${day(b.endDate)}`] as const)
    .sort((a, b) => a[2].localeCompare(b[2]) || a[0] - b[0])
const sumCents = (line: any) => read(line).reduce((s, b) => s + b[0], 0)

/** A $5,000.00 span over weeks 1 and 2, a $3,000.00 burst over weeks 2 to 4, a $1,000.00 burst Mar 17 to 18. */
const saved: any = {
  buyType: "fixed_cost",
  budgetIncludesFees: false,
  clientPaysForMedia: false,
  fixedCostMedia: false,
  noadserving: false,
  line_item_id: "c370fix",
  lineItemId: "c370fix",
  line_item: 1,
  lineItem: 1,
  bursts: [
    { budget: "$5,000.00", buyAmount: "$5,000.00", calculatedValue: 1, startDate: "2026-03-01", endDate: "2026-03-14", fee: 0 },
    { budget: "$3,000.00", buyAmount: "$3,000.00", calculatedValue: 1, startDate: "2026-03-08", endDate: "2026-03-28", fee: 0 },
    { budget: "$1,000.00", buyAmount: "$1,000.00", calculatedValue: 1, startDate: "2026-03-17", endDate: "2026-03-18", fee: 0 },
  ],
}

function run(wso: 0 | 1, edit?: (row: any) => void) {
  const cols = buildWeeklyGanttColumnsFromCampaign(START, END, wso)
  const keys = cols.map((c) => c.weekKey)
  const rows = M.mapStandardRadioLineItemsToExpertRows([saved], cols, START, END, { feePct: 0 })
  edit?.(rows[0])
  const grid = expertRowCostSplit(rows[0], keys, 0).raw
  const applied = S.mergeRadioStandardFromExpertWithPrevious(
    M.mapRadioExpertRowsToStandardLineItems(rows, cols, START, END, { feePctRadio: 0, budgetIncludesFees: false }),
    [saved]
  )[0]
  return { row: rows[0] as any, grid, applied }
}

for (const wso of [0, 1] as const) {
  const grid = wso ? "Monday" : "Sunday"
  const heldWeek = wso ? "2026-03-16" : "2026-03-15"

  test(`Radio fixed cost, ${grid} grid: a sub-week burst does not split the held week cell into days (V107 A, until V96)`, () => {
    const { row, applied } = run(wso)
    assert.equal(row.weeklyValues[heldWeek], 1)
    assert.deepEqual(read(applied), read(saved))
  })

  test(`Radio fixed cost, ${grid} grid: editing the span saves $10,000.00, not $15,000.00 (V107 A, review probe P6)`, () => {
    const { applied, grid: gridMoney } = run(wso, (row) => {
      row.mergedWeekSpans[0].totalQty += 1
    })
    assert.equal(sumCents(applied), 1_000_000)
    // C-369 (held for V96): the grid prices fixed cost once per line.
    assert.equal(Math.round(gridMoney * 100), 500_000)
  })
}
