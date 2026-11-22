import "@/lib/testing/bothZones"
/**
 * C371 (V102 A, C-370): a burst saved with 0 deliverables and a blank budget
 * is one the grid cannot place. Apply gives it back exactly as saved, edited
 * or not, like one saved with a $0.00 budget. Live shapes: BOSS009 1277
 * (Radio, no buy type, a whole month blank) and penfold026 55418 to 55422
 * (OOH panels, blank, starting before the campaign). Sunday and Monday grids,
 * both zones.
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
type Channel = { name: string; feeKey: string; buyType: string; rate: string; qty: number; toExpert: AnyFn; fromExpert: AnyFn; merge: AnyFn; toExpertFee?: boolean }

const CHANNELS: Channel[] = [
  { name: "Radio", feeKey: "feePctRadio", buyType: "spots", rate: "$650.00", qty: 3, toExpert: M.mapStandardRadioLineItemsToExpertRows, fromExpert: M.mapRadioExpertRowsToStandardLineItems, merge: S.mergeRadioStandardFromExpertWithPrevious, toExpertFee: true },
  { name: "OOH", feeKey: "feePctOoh", buyType: "panels", rate: "$1,450.00", qty: 3, toExpert: M.mapStandardOohLineItemsToExpertRows, fromExpert: M.mapOohExpertRowsToStandardLineItems, merge: S.mergeOohStandardFromExpertWithPrevious },
  { name: "Television", feeKey: "feePctTelevision", buyType: "spots", rate: "$650.00", qty: 3, toExpert: M.mapStandardTvLineItemsToExpertRows, fromExpert: M.mapTvExpertRowsToStandardLineItems, merge: S.mergeTelevisionStandardFromExpertWithPrevious },
  { name: "Search", feeKey: "feePctSearch", buyType: "cpc", rate: "$2.00", qty: 975, toExpert: M.mapStandardSearchLineItemsToExpertRows, fromExpert: M.mapSearchExpertRowsToStandardLineItems, merge: S.mergeSearchStandardFromExpertWithPrevious },
  { name: "Newspaper", feeKey: "feePctNewspaper", buyType: "insertions", rate: "$650.00", qty: 3, toExpert: M.mapStandardNewspaperLineItemsToExpertRows, fromExpert: M.mapNewspaperExpertRowsToStandardLineItems, merge: S.mergeNewspaperStandardFromExpertWithPrevious },
]

const START = new Date(2026, 2, 1)
const END = new Date(2026, 2, 28)
const day = (d: unknown) => (d instanceof Date ? format(d, "yyyy-MM-dd") : formatBurstDateLocal(String(d ?? "")))
const one = (b: any) => [toCents(parseBurstMoney(b.budget)), Number(b.calculatedValue), toCents(parseBurstMoney(b.buyAmount)), `${day(b.startDate)}..${day(b.endDate)}`, b.buyType ?? ""] as const
const read = (line: any) => [...(line.bursts ?? [])].map(one).sort((a, b) => a[3].localeCompare(b[3]) || a[0] - b[0])
const sumCents = (line: any) => read(line).reduce((s, b) => s + b[0], 0)
const lineOf = (buyType: string, bursts: any[]) => ({ buyType, budgetIncludesFees: false, clientPaysForMedia: false, fixedCostMedia: false, noadserving: false, line_item_id: "c371", lineItemId: "c371", line_item: 1, lineItem: 1, bursts })
const blank = (startDate: string, endDate: string) => ({ budget: "", buyAmount: "", calculatedValue: 0, startDate, endDate })

function run(ch: Channel, saved: any, wso: 0 | 1, edit?: (row: any) => void) {
  const cols = buildWeeklyGanttColumnsFromCampaign(START, END, wso)
  const rows = ch.toExpert([saved], cols, START, END, ...(ch.toExpertFee ? [{ feePct: 0 }] : []))
  edit?.(rows[0])
  const grid = toCents(expertRowCostSplit(rows[0], cols.map((c) => c.weekKey), 0).raw)
  const applied = ch.merge(ch.fromExpert(rows, cols, START, END, { [ch.feeKey]: 0, budgetIncludesFees: false }), [saved])[0]
  return { row: rows[0] as any, grid, applied }
}

for (const wso of [0, 1] as const) {
  const grid = wso ? "Monday" : "Sunday"

  test(`Radio, ${grid} grid: a lone blank burst with no buy type comes back as saved (BOSS009 1277 shape, V102 A)`, () => {
    const saved = lineOf("", [blank("2026-03-01", "2026-03-28")])
    const { row, applied } = run(CHANNELS[0]!, saved, wso)
    assert.equal(row.expertCarry.unplaced.length, 1)
    assert.deepEqual(read(applied), read(saved))
  })

  test(`OOH panels, ${grid} grid: a lone blank burst starting before the campaign comes back with its own dates (penfold026 55418 shape, V102 A)`, () => {
    const saved = lineOf("panels", [blank("2026-02-21", "2026-03-27")])
    assert.deepEqual(read(run(CHANNELS[1]!, saved, wso).applied), read(saved))
  })

  for (const ch of CHANNELS) {
    const paid = { budget: `$${(ch.qty * parseBurstMoney(ch.rate)).toFixed(2)}`, buyAmount: ch.rate, calculatedValue: ch.qty, startDate: "2026-03-01", endDate: "2026-03-07" }
    const saved = lineOf(ch.buyType, [paid, blank("2026-03-15", "2026-03-21")])
    // +1 on the paid week: a one-week span (spread imports) or its week cell.
    const bump = (row: any) => {
      if (row.mergedWeekSpans?.length) row.mergedWeekSpans[0].totalQty += 1
      else {
        const k = Object.keys(row.weeklyValues).sort().find((w) => Number(row.weeklyValues[w]) > 0)!
        row.weeklyValues[k] = Number(row.weeklyValues[k]) + 1
      }
    }

    test(`${ch.name}, ${grid} grid: a blank burst beside a paid one comes back as saved, untouched and with the paid week edited; grid = Apply (V102 A)`, () => {
      assert.deepEqual(read(run(ch, saved, wso).applied), read(saved))
      const edited = run(ch, saved, wso, bump)
      assert.deepEqual(read(edited.applied).filter((b) => b[3] === "2026-03-15..2026-03-21"), read(lineOf(ch.buyType, [saved.bursts[1]])))
      assert.equal(edited.grid, sumCents(edited.applied))
      assert.ok(edited.grid > sumCents(saved))
    })
  }
}
