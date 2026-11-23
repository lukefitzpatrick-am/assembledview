import "@/lib/testing/bothZones"
/**
 * C370fix: pins the C370 review found missing (F5, F6, F1). No source
 * change. Each kills a mutation that survived the expert core and the broad
 * `lib/mediaplan/` and `tests/lib/` suites (review V6, V7, V12, V17, V18).
 * The Production pin runs on the container's load shape (V104 A, C371). Sunday and Monday grids, both zones.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { format } from "date-fns"

import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { computeLoadedDeliverables } from "@/lib/mediaplan/deliverableBudget"
import * as M from "@/lib/mediaplan/expertChannelMappings"
import * as S from "@/lib/mediaplan/expertModeSwitch"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import { toCents } from "@/lib/money/cents"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

type AnyFn = (...args: any[]) => any
type Channel = { name: string; feeKey: string; toExpert: AnyFn; fromExpert: AnyFn; merge: AnyFn; toExpertFee?: boolean }

const SPREAD: Channel[] = [
  { name: "OOH", feeKey: "feePctOoh", toExpert: M.mapStandardOohLineItemsToExpertRows, fromExpert: M.mapOohExpertRowsToStandardLineItems, merge: S.mergeOohStandardFromExpertWithPrevious },
  { name: "Radio", feeKey: "feePctRadio", toExpert: M.mapStandardRadioLineItemsToExpertRows, fromExpert: M.mapRadioExpertRowsToStandardLineItems, merge: S.mergeRadioStandardFromExpertWithPrevious, toExpertFee: true },
  { name: "Television", feeKey: "feePctTelevision", toExpert: M.mapStandardTvLineItemsToExpertRows, fromExpert: M.mapTvExpertRowsToStandardLineItems, merge: S.mergeTelevisionStandardFromExpertWithPrevious },
  { name: "Cinema", feeKey: "feePctCinema", toExpert: M.mapStandardCinemaLineItemsToExpertRows, fromExpert: M.mapCinemaExpertRowsToStandardLineItems, merge: S.mergeCinemaStandardFromExpertWithPrevious },
  { name: "BVOD", feeKey: "feePctBvod", toExpert: M.mapStandardBvodLineItemsToExpertRows, fromExpert: M.mapBvodExpertRowsToStandardLineItems, merge: S.mergeBvodStandardFromExpertWithPrevious },
  { name: "Digital Audio", feeKey: "feePctDigiAudio", toExpert: M.mapStandardDigiAudioLineItemsToExpertRows, fromExpert: M.mapDigitalAudioExpertRowsToStandardLineItems, merge: S.mergeDigiAudioStandardFromExpertWithPrevious },
]
const byName = (n: string) => SPREAD.find((c) => c.name === n)!
const SEARCH: Channel = { name: "Search", feeKey: "feePctSearch", toExpert: M.mapStandardSearchLineItemsToExpertRows, fromExpert: M.mapSearchExpertRowsToStandardLineItems, merge: S.mergeSearchStandardFromExpertWithPrevious }

const START = new Date(2026, 2, 1)
const END = new Date(2026, 2, 28)
const GRIDS = [0, 1] as const
const gridName = (wso: 0 | 1) => (wso ? "Monday" : "Sunday")

const day = (d: unknown) => (d instanceof Date ? format(d, "yyyy-MM-dd") : formatBurstDateLocal(String(d ?? "")))
/** A burst as [budget cents, budget type, deliverables, rate cents, dates, own buy type]. */
const one = (b: any) => [toCents(parseBurstMoney(b.budget)), typeof b.budget, Number(b.calculatedValue), toCents(parseBurstMoney(b.buyAmount)), `${day(b.startDate)}..${day(b.endDate)}`, b.buyType ?? ""] as const
/** A line's bursts in date order (sorted: most pins do not test order). */
const read = (line: any) => [...(line.bursts ?? [])].map(one).sort((a, b) => a[4].localeCompare(b[4]) || a[0] - b[0])
const sumCents = (line: any) => read(line).reduce((s, b) => s + b[0], 0)

function lineOf(buyType: string, bursts: any[]) {
  return { buyType, budgetIncludesFees: false, clientPaysForMedia: false, fixedCostMedia: false, noadserving: false, line_item_id: "c370pins", lineItemId: "c370pins", line_item: 1, lineItem: 1, bursts }
}
function paid(bt: string, rate: string, budget: string, startDate: string, endDate: string) {
  const burst = { budget, buyAmount: rate }
  return { ...burst, calculatedValue: computeLoadedDeliverables(bt, burst, false, 0), startDate, endDate }
}

function run(ch: Channel, saved: any, wso: 0 | 1, edit?: (row: any) => void, fromOptions: object = {}) {
  const cols = buildWeeklyGanttColumnsFromCampaign(START, END, wso)
  const rows = ch.toExpert([saved], cols, START, END, ...(ch.toExpertFee ? [{ feePct: 0 }] : []))
  edit?.(rows[0])
  const applied = ch.merge(ch.fromExpert(rows, cols, START, END, { [ch.feeKey]: 0, budgetIncludesFees: false, ...fromOptions }), [saved])[0]
  return { row: rows[0] as any, applied }
}
const bumpFirstSpan = (row: any) => {
  row.mergedWeekSpans[0].totalQty += 1
}

// --- F5 (review V12): the V95 fold moves only this burst's share ---------------------

for (const wso of GRIDS) {
  // Review probe P13: a paid span of 4 panels; a bonus burst of 3 opens under
  // it (other buy type: hidden, not folded); a paid burst of 2 entirely under
  // the span then folds its own 2, never the bonus panels beside it.
  const saved = lineOf("panels", [
    paid("panels", "$1,450.00", "$5,800.00", "2026-03-01", "2026-03-28"),
    { buyType: "bonus", budget: "0", buyAmount: "0", calculatedValue: 3, startDate: "2026-03-08", endDate: "2026-03-21" },
    paid("panels", "$1,450.00", "$2,900.00", "2026-03-15", "2026-03-28"),
  ])

  test(`OOH, ${gridName(wso)} grid: a paid burst folds only its own share into the span, not a bonus share hidden beside it (V95 A, review P13)`, () => {
    const { row, applied } = run(byName("OOH"), saved, wso)
    assert.equal(row.mergedWeekSpans.length, 1)
    assert.equal(row.mergedWeekSpans[0].totalQty, 6)
    assert.deepEqual(read(applied), read(saved))
  })

  test(`OOH, ${gridName(wso)} grid: the span edited saves 7 panels, $10,150.00, with no bonus panels turned paid (V95 A, review P13)`, () => {
    const { applied } = run(byName("OOH"), saved, wso, bumpFirstSpan)
    assert.equal(sumCents(applied), 1_015_000)
  })
}

// --- F6 (review V6): an echo is a burst with no quantity and no money ------------------

for (const wso of GRIDS) {
  test(`Search package, ${gridName(wso)} grid: an edited cell written with 0 deliverables and money is kept beside a burst the grid cannot place (C-370, review V6)`, () => {
    // With the package quantity switch off, an edited package cell is written
    // with 0 deliverables and its money. The $2,000.00 burst at a $0.00 rate is
    // one the grid cannot place. Apply must write both.
    const saved = lineOf("package", [
      { budget: "$5,000.00", buyAmount: "$5,000.00", calculatedValue: 1, startDate: "2026-03-01", endDate: "2026-03-14" },
      { budget: "$2,000.00", buyAmount: "$0.00", calculatedValue: 0, startDate: "2026-03-15", endDate: "2026-03-21" },
    ])
    const untouched = run(SEARCH, saved, wso, undefined, { packageKeepsEnteredQty: false })
    assert.equal(untouched.row.expertCarry.unplaced.length, 1)
    assert.deepEqual(read(untouched.applied), read(saved))
    const { applied } = run(SEARCH, saved, wso, bumpFirstSpan, { packageKeepsEnteredQty: false })
    const edited = read(applied).filter((b) => b[2] === 0 && b[0] === 1_000_000)
    assert.equal(edited.length, 1, JSON.stringify(read(applied)))
    assert.deepEqual(read(applied).filter((b) => b[0] === 200_000), read(lineOf("package", [saved.bursts[1]])))
    assert.equal(sumCents(applied), 1_200_000)
  })
}

// --- F6 (review V17): package inclusions saved with a blank budget is carried ---------

for (const ch of SPREAD) {
  for (const wso of GRIDS) {
    test(`${ch.name}, ${gridName(wso)} grid: package inclusions bursts saved with a blank budget come back as saved (C-370, review V17)`, () => {
      const saved = lineOf("package_inclusions", [
        { budget: "0", buyAmount: "0", calculatedValue: 12, startDate: "2026-03-01", endDate: "2026-03-14" },
        { budget: "", buyAmount: "", calculatedValue: 5, startDate: "2026-03-15", endDate: "2026-03-28" },
      ])
      assert.deepEqual(read(run(ch, saved, wso).applied), read(saved))
    })
  }
}

// --- F6 (review V7, V18): saved burst order kept beside a burst the grid cannot place -

for (const wso of GRIDS) {
  test(`Radio, ${gridName(wso)} grid: a line with a burst the grid cannot place keeps its saved burst order, that burst after a burst starting the same day (C-370, review V7 and V18)`, () => {
    const saved = lineOf("spots", [
      paid("spots", "$650.00", "$1,950.00", "2026-03-01", "2026-03-07"),
      paid("spots", "$650.00", "$2,600.00", "2026-03-08", "2026-03-14"),
      { budget: "$684.00", buyAmount: "$0.00", calculatedValue: 0, startDate: "2026-03-08", endDate: "2026-03-14" },
      paid("spots", "$650.00", "$3,250.00", "2026-03-15", "2026-03-28"),
    ])
    const { row, applied } = run(byName("Radio"), saved, wso)
    assert.equal(row.expertCarry.unplaced.length, 1)
    assert.deepEqual(applied.bursts.map(one), saved.bursts.map(one))
  })
}

// --- F1 (review): Production on the container path (V104) ----------------------------

test(
  "Production on its bare load shape (cost, amount, dates, no budget): a burst after the campaign end comes back as saved untouched (V104 A, C371)",
  () => {
    const d = (y: number, m: number, dd: number) => new Date(y, m - 1, dd)
    const saved: any = {
      mediaType: "Production",
      publisher: "Studio",
      description: "Edit",
      market: "National",
      unitRate: 1234.56,
      buyType: "production",
      line_item_id: "c370Production",
      lineItemId: "c370Production",
      line_item: 1,
      lineItem: 1,
      bursts: [
        { cost: 1234.56, amount: 3, startDate: d(2026, 3, 1), endDate: d(2026, 3, 14) },
        { cost: 1234.56, amount: 2, startDate: d(2026, 4, 5), endDate: d(2026, 4, 30) },
      ],
    }
    const shape = (l: any) => [...l.bursts].map((b: any) => [Number(b.cost), Number(b.amount), day(b.startDate), day(b.endDate)]).sort((a, b) => String(a[2]).localeCompare(String(b[2])))
    for (const wso of GRIDS) {
      const cols = buildWeeklyGanttColumnsFromCampaign(START, END, wso)
      const rows = M.mapStandardProductionLineItemsToExpertRows([saved], cols, START, END)
      const applied = S.mergeProductionStandardFromExpertWithPrevious(M.mapProductionExpertRowsToStandardLineItems(rows, cols, START, END), [saved])[0] as any
      assert.deepEqual(shape(applied), shape(saved))
    }
  }
)
