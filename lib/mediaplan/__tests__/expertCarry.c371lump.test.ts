import "@/lib/testing/bothZones"
/**
 * C371 (V105 A, C-370 (3)): a line whose import places nothing gets the
 * card's lump sum in week 1 (`projectLumpSumCardBudgetsOntoExpertRows`).
 * When that is the only quantity on the row, the line's saved bursts are one
 * week-1 group: untouched they come back exactly as saved (dates,
 * deliverables, rate, money); edit week 1 and it is priced from the grid, and
 * the saved burst is not written as well (the C370 backstop: golf028 38068
 * stays $7.00, never $14.00). Live shapes: PENFOLD018 31931 and penfold025
 * 48021 (Television package), penfold025 48022 (BVOD package, blank rate),
 * golf025 54707 (OOH package), golf028 38068 (OOH panels, $7.00, blank rate),
 * PENFOLD020 45603 and 45605, penfold026 55423 (Integration package). Sunday
 * and Monday grids, both zones.
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

type AnyFn = (...args: any[]) => any
type Channel = { name: string; feeKey: string; toExpert: AnyFn; fromExpert: AnyFn; merge: AnyFn }
const TV: Channel = { name: "Television", feeKey: "feePctTelevision", toExpert: M.mapStandardTvLineItemsToExpertRows, fromExpert: M.mapTvExpertRowsToStandardLineItems, merge: S.mergeTelevisionStandardFromExpertWithPrevious }
const BVOD: Channel = { name: "BVOD", feeKey: "feePctBvod", toExpert: M.mapStandardBvodLineItemsToExpertRows, fromExpert: M.mapBvodExpertRowsToStandardLineItems, merge: S.mergeBvodStandardFromExpertWithPrevious }
const OOH: Channel = { name: "OOH", feeKey: "feePctOoh", toExpert: M.mapStandardOohLineItemsToExpertRows, fromExpert: M.mapOohExpertRowsToStandardLineItems, merge: S.mergeOohStandardFromExpertWithPrevious }
const INTEGRATION: Channel = { name: "Integration", feeKey: "feePctIntegration", toExpert: M.mapStandardIntegrationLineItemsToExpertRows, fromExpert: M.mapIntegrationExpertRowsToStandardLineItems, merge: S.mergeIntegrationStandardFromExpertWithPrevious }

const START = new Date(2026, 2, 1)
const END = new Date(2026, 5, 28)
const day = (d: unknown) => (d instanceof Date ? format(d, "yyyy-MM-dd") : formatBurstDateLocal(String(d ?? "")))
const one = (b: any) => [toCents(parseBurstMoney(b.budget)), Number(b.calculatedValue), toCents(parseBurstMoney(b.buyAmount)), String(b.buyAmount ?? ""), `${day(b.startDate)}..${day(b.endDate)}`] as const
const read = (line: any) => (line.bursts ?? []).map(one)
const sumCents = (line: any) => read(line).reduce((s: number, b: any) => s + b[0], 0)
const lineOf = (buyType: string, bursts: any[]) => ({ buyType, budgetIncludesFees: false, clientPaysForMedia: false, fixedCostMedia: false, noadserving: false, line_item_id: "c371l", lineItemId: "c371l", line_item: 1, lineItem: 1, bursts })
const pkg = (budget: string, buyAmount: string, startDate: string, endDate: string) => ({ budget, buyAmount, calculatedValue: 0, startDate, endDate })

const SHAPES: { name: string; ch: Channel; saved: any }[] = [
  { name: "Television package, $0.00 rate (PENFOLD018 31931)", ch: TV, saved: lineOf("package", [pkg("$150,000.00", "$0.00", "2026-04-12", "2026-05-09")]) },
  { name: "Television package ending on the campaign's last day (penfold025 48021)", ch: TV, saved: lineOf("package", [pkg("$35,000.00", "$0.00", "2026-06-26", "2026-06-28")]) },
  { name: "BVOD package, blank rate (penfold025 48022)", ch: BVOD, saved: lineOf("package", [pkg("$95,000.00", "", "2026-06-26", "2026-06-28")]) },
  { name: "OOH package, rate = budget (golf025 54707)", ch: OOH, saved: lineOf("package", [pkg("15000", "$15,000.00", "2026-05-24", "2026-05-30")]) },
  { name: "OOH panels $7.00, blank rate, past the campaign end (golf028 38068)", ch: OOH, saved: lineOf("panels", [pkg("7", "", "2026-06-01", "2026-06-30")]) },
  { name: "Integration package, rate = budget (PENFOLD020 45603)", ch: INTEGRATION, saved: lineOf("package", [pkg("7000", "$7,000.00", "2026-05-03", "2026-05-24")]) },
  { name: "Integration package over two months (penfold026 55423)", ch: INTEGRATION, saved: lineOf("package", [pkg("$60,000.00", "$60,000.00", "2026-04-01", "2026-05-30")]) },
]

function run(ch: Channel, saved: any, wso: 0 | 1, edit?: (row: any, week1: string) => void) {
  const cols = buildWeeklyGanttColumnsFromCampaign(START, END, wso)
  const rows = ch.toExpert([saved], cols, START, END)
  edit?.(rows[0], cols[0]!.weekKey)
  const grid = toCents(expertRowCostSplit(rows[0], cols.map((c) => c.weekKey), 0).raw)
  const applied = ch.merge(ch.fromExpert(rows, cols, START, END, { [ch.feeKey]: 0, budgetIncludesFees: false }), [saved])[0]
  return { row: rows[0] as any, grid, applied }
}

for (const wso of [0, 1] as const) {
  const grid = wso ? "Monday" : "Sunday"
  for (const { name, ch, saved } of SHAPES) {
    test(`${ch.name}, ${grid} grid: ${name}: the lump sum is the only quantity, in week 1, and untouched Apply gives the burst back exactly as saved (V105 A)`, () => {
      const { row, grid: money, applied } = run(ch, saved, wso)
      assert.deepEqual(Object.keys(row.weeklyValues).filter((k) => Number(row.weeklyValues[k]) > 0), [Object.keys(row.weeklyValues).sort()[0]])
      assert.deepEqual(read(applied), read(saved))
      assert.equal(money, sumCents(saved))
    })

    test(`${ch.name}, ${grid} grid: ${name}: week 1 doubled is priced from the grid, written once, grid = Apply (V105 A)`, () => {
      const { grid: money, applied } = run(ch, saved, wso, (row, w1) => (row.weeklyValues[w1] = Number(row.weeklyValues[w1]) * 2))
      assert.equal(applied.bursts.length, 1)
      assert.equal(money, 2 * sumCents(saved))
      assert.equal(sumCents(applied), money)
    })
  }
}

for (const wso of [0, 1] as const) {
  test(`Integration, ${wso ? "Monday" : "Sunday"} grid: a lump-sum line's burst comes back as the line's own burst, every field as held (V105 A)`, () => {
    const own = { budget: "$7,000.00", buyAmount: "$7,000.00", calculatedValue: 0, fee: 0, startDate: "2026-05-03", endDate: "2026-05-24" }
    assert.deepEqual(run(INTEGRATION, lineOf("package", [own]), wso).applied.bursts, [own])
  })
}
