import "@/lib/testing/bothZones"
/**
 * C370 (V97 A, C-368 reverse): a sub-week burst whose day path lands in a
 * week that holds a week cell (and no day values) splits that cell into day
 * cells first with `expandWeekToDaily`, as the grid's `updateDailyCell` does
 * when a planner types a day value there, then adds its days. Nothing is left
 * as a week cell beside day cells, so an edited group saves what the grid
 * shows; untouched lines stay exact. The six spread channels, Sunday and
 * Monday grids, both zones, fee on top and fee-inclusive. Kept apart from the
 * other C370 files so each item can be dropped alone.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { format } from "date-fns"

import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { computeLoadedDeliverables } from "@/lib/mediaplan/deliverableBudget"
import * as M from "@/lib/mediaplan/expertChannelMappings"
import * as S from "@/lib/mediaplan/expertModeSwitch"
import { expertRowCostSplit } from "@/lib/mediaplan/expertRowCost"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import { toCents } from "@/lib/money/cents"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

type AnyFn = (...args: any[]) => any
type Channel = { name: string; feeKey: string; buyType: string; toExpert: AnyFn; fromExpert: AnyFn; merge: AnyFn; toExpertFee?: boolean; feeOnly?: boolean; bonus?: boolean; spread?: boolean }

/** Every grid with a rate-priced buy type it offers, and whether it offers bonus. */
const CHANNELS: Channel[] = [
  { name: "Search", feeKey: "feePctSearch", buyType: "cpc", toExpert: M.mapStandardSearchLineItemsToExpertRows, fromExpert: M.mapSearchExpertRowsToStandardLineItems, merge: S.mergeSearchStandardFromExpertWithPrevious },
  { name: "Social", feeKey: "feePctSocial", buyType: "cpm", toExpert: M.mapStandardSocialMediaLineItemsToExpertRows, fromExpert: M.mapSocialMediaExpertRowsToStandardLineItems, merge: S.mergeSocialMediaStandardFromExpertWithPrevious },
  { name: "Influencers", feeKey: "feePctInfluencers", buyType: "cpm", toExpert: M.mapStandardInfluencersLineItemsToExpertRows, fromExpert: M.mapInfluencersExpertRowsToStandardLineItems, merge: S.mergeInfluencersStandardFromExpertWithPrevious },
  { name: "Integration", feeKey: "feePctIntegration", buyType: "cpm", toExpert: M.mapStandardIntegrationLineItemsToExpertRows, fromExpert: M.mapIntegrationExpertRowsToStandardLineItems, merge: S.mergeIntegrationStandardFromExpertWithPrevious },
  { name: "Digital Video", feeKey: "feePctDigiVideo", buyType: "cpv", toExpert: M.mapStandardDigiVideoLineItemsToExpertRows, fromExpert: M.mapDigiVideoExpertRowsToStandardLineItems, merge: S.mergeDigiVideoStandardFromExpertWithPrevious },
  { name: "Digital Display", feeKey: "feePctDigiDisplay", buyType: "cpm", toExpert: M.mapStandardDigiDisplayLineItemsToExpertRows, fromExpert: M.mapDigitalDisplayExpertRowsToStandardLineItems, merge: S.mergeDigiDisplayStandardFromExpertWithPrevious },
  { name: "Digital Audio", feeKey: "feePctDigiAudio", buyType: "cpm", toExpert: M.mapStandardDigiAudioLineItemsToExpertRows, fromExpert: M.mapDigitalAudioExpertRowsToStandardLineItems, merge: S.mergeDigiAudioStandardFromExpertWithPrevious, bonus: true , spread: true },
  { name: "BVOD", feeKey: "feePctBvod", buyType: "cpm", toExpert: M.mapStandardBvodLineItemsToExpertRows, fromExpert: M.mapBvodExpertRowsToStandardLineItems, merge: S.mergeBvodStandardFromExpertWithPrevious, bonus: true , spread: true },
  { name: "Prog Display", feeKey: "feePctProgDisplay", buyType: "cpm", toExpert: M.mapStandardProgDisplayLineItemsToExpertRows, fromExpert: M.mapProgDisplayExpertRowsToStandardLineItems, merge: S.mergeProgDisplayStandardFromExpertWithPrevious },
  { name: "Prog Video", feeKey: "feePctProgVideo", buyType: "cpm", toExpert: M.mapStandardProgVideoLineItemsToExpertRows, fromExpert: M.mapProgVideoExpertRowsToStandardLineItems, merge: S.mergeProgVideoStandardFromExpertWithPrevious },
  { name: "Prog BVOD", feeKey: "feePctProgBvod", buyType: "cpm", toExpert: M.mapStandardProgBvodLineItemsToExpertRows, fromExpert: M.mapProgBvodExpertRowsToStandardLineItems, merge: S.mergeProgBvodStandardFromExpertWithPrevious },
  { name: "Prog Audio", feeKey: "feePctProgAudio", buyType: "cpm", toExpert: M.mapStandardProgAudioLineItemsToExpertRows, fromExpert: M.mapProgAudioExpertRowsToStandardLineItems, merge: S.mergeProgAudioStandardFromExpertWithPrevious },
  { name: "Prog OOH", feeKey: "feePctProgOoh", buyType: "cpm", toExpert: M.mapStandardProgOohLineItemsToExpertRows, fromExpert: M.mapProgOohExpertRowsToStandardLineItems, merge: S.mergeProgOohStandardFromExpertWithPrevious },
  { name: "Newspaper", feeKey: "feePctNewspaper", buyType: "insertions", toExpert: M.mapStandardNewspaperLineItemsToExpertRows, fromExpert: M.mapNewspaperExpertRowsToStandardLineItems, merge: S.mergeNewspaperStandardFromExpertWithPrevious },
  { name: "Magazines", feeKey: "feePctMagazines", buyType: "insertions", toExpert: M.mapStandardMagazineLineItemsToExpertRows, fromExpert: M.mapMagazineExpertRowsToStandardLineItems, merge: S.mergeMagazineStandardFromExpertWithPrevious },
  { name: "Cinema", feeKey: "feePctCinema", buyType: "spots", toExpert: M.mapStandardCinemaLineItemsToExpertRows, fromExpert: M.mapCinemaExpertRowsToStandardLineItems, merge: S.mergeCinemaStandardFromExpertWithPrevious, bonus: true , spread: true },
  { name: "Radio", feeKey: "feePctRadio", buyType: "spots", toExpert: M.mapStandardRadioLineItemsToExpertRows, fromExpert: M.mapRadioExpertRowsToStandardLineItems, merge: S.mergeRadioStandardFromExpertWithPrevious, toExpertFee: true, bonus: true , spread: true },
  { name: "Television", feeKey: "feePctTelevision", buyType: "spots", toExpert: M.mapStandardTvLineItemsToExpertRows, fromExpert: M.mapTvExpertRowsToStandardLineItems, merge: S.mergeTelevisionStandardFromExpertWithPrevious, bonus: true , spread: true },
  { name: "OOH", feeKey: "feePctOoh", buyType: "panels", toExpert: M.mapStandardOohLineItemsToExpertRows, fromExpert: M.mapOohExpertRowsToStandardLineItems, merge: S.mergeOohStandardFromExpertWithPrevious, feeOnly: true, bonus: true , spread: true },
]

const RATE: Record<string, string> = { cpm: "$15.00", cpc: "$2.37", cpv: "$0.07", spots: "$650.00", insertions: "$2,950.00", panels: "$1,450.00" }
const START = new Date(2026, 2, 1)
const END = new Date(2026, 2, 28)
const FEES = [
  { incl: false, fee: 0 },
  { incl: true, fee: 12.5 },
] as const

const day = (d: unknown) => (d instanceof Date ? format(d, "yyyy-MM-dd") : formatBurstDateLocal(String(d ?? "")))
const cents = (n: number) => Math.round(n * 100)
/** A burst as [budget cents, budget type, deliverables, rate cents, dates, own buy type], lines' bursts in date order. */
const read = (line: any) =>
  [...(line.bursts ?? [])]
    .map((b: any) => [toCents(parseBurstMoney(b.budget)), typeof b.budget, Number(b.calculatedValue), toCents(parseBurstMoney(b.buyAmount)), `${day(b.startDate)}..${day(b.endDate)}`, b.buyType ?? ""] as const)
    .sort((a, b) => a[4].localeCompare(b[4]) || a[0] - b[0])

function lineOf(buyType: string, incl: boolean, bursts: any[]) {
  return { buyType, budgetIncludesFees: incl, clientPaysForMedia: false, fixedCostMedia: false, noadserving: false, line_item_id: "c370", lineItemId: "c370", line_item: 1, lineItem: 1, bursts }
}
function paid(bt: string, incl: boolean, fee: number, budget: string, startDate: string, endDate: string) {
  const burst = { budget, buyAmount: RATE[bt]! }
  return { ...burst, calculatedValue: computeLoadedDeliverables(bt, burst, incl, fee), startDate, endDate }
}

function run(ch: Channel, saved: any, fee: number, wso: 0 | 1, edit?: (row: any, keys: string[]) => void) {
  const cols = buildWeeklyGanttColumnsFromCampaign(START, END, wso)
  const keys = cols.map((c) => c.weekKey)
  const rows = ch.toExpert([saved], cols, START, END, ...(ch.toExpertFee ? [{ feePct: fee }] : []))
  edit?.(rows[0], keys)
  const grid = expertRowCostSplit(rows[0], keys, fee).raw
  const opts = ch.feeOnly ? { [ch.feeKey]: fee } : { [ch.feeKey]: fee, budgetIncludesFees: Boolean(saved.budgetIncludesFees) }
  const applied = ch.merge(ch.fromExpert(rows, cols, START, END, opts), [saved])[0]
  return { row: rows[0], grid, applied }
}

const sumCents = (line: any) => read(line).reduce((s, b) => s + b[0], 0)


// --- V97 A (C-368 reverse), the six spread channels ---------------------------------

const SPREAD = CHANNELS.filter((c) => c.spread)
const weekOf = (keys: string[], d: string) => [...keys].reverse().find((k) => k <= d)!
/** Week cells in a week that also holds day values: what Apply does not write. */
function cellBesideDays(row: any, keys: string[]) {
  const dayWeeks = new Set(Object.entries(row.dailyValues ?? {}).filter(([, v]) => v !== "" && v !== undefined).map(([d]) => weekOf(keys, d)))
  return [...dayWeeks].reduce((q, k) => q + Number(row.weeklyValues[k] || 0), 0)
}
const qtyOf = (line: any) => (line.bursts ?? []).reduce((t: number, b: any) => t + Number(b.calculatedValue || 0), 0)
/** Per grid: a span, a burst overlapping it that opens as one week cell, and a sub-week burst inside that week. */
const SHAPE = {
  0: { span: ["2026-03-01", "2026-03-14"], cell: ["2026-03-08", "2026-03-21"], days: ["2026-03-16", "2026-03-18"], week: "2026-03-15" },
  1: { span: ["2026-03-02", "2026-03-15"], cell: ["2026-03-09", "2026-03-22"], days: ["2026-03-17", "2026-03-19"], week: "2026-03-16" },
} as const

for (const ch of SPREAD) {
  for (const wso of [0, 1] as const) {
    for (const { incl, fee } of FEES) {
      const tag = `${ch.name}, ${wso ? "Monday" : "Sunday"} grid, ${incl ? "fee-inclusive 12.5%" : "fee on top 0%"}`
      const bt = ch.buyType
      const sh = SHAPE[wso]
      const saved = lineOf(bt, incl, [
        paid(bt, incl, fee, "$7,777.00", sh.span[0], sh.span[1]),
        paid(bt, incl, fee, "$5,200.00", sh.cell[0], sh.cell[1]),
        paid(bt, incl, fee, "$2,600.00", sh.days[0], sh.days[1]),
      ])
      const keys = buildWeeklyGanttColumnsFromCampaign(START, END, wso).map((c) => c.weekKey)

      test(`${tag}: a sub-week burst in a week that holds a week cell splits the cell into days first (V97 A)`, () => {
        const untouched = run(ch, saved, fee, wso)
        const row = untouched.row
        assert.equal(row.weeklyValues[sh.week], "")
        assert.equal(cellBesideDays(row, keys), 0)
        const dayQty = Object.entries(row.dailyValues ?? {}).reduce((q, [, v]) => q + Number(v || 0), 0)
        assert.equal(spanQty(row) + dayQty, qtyOf(saved))
        assert.deepEqual(read(untouched.applied), read(saved))
      })

      test(`${tag}: an edited day in that week saves what the grid shows (V97 A)`, () => {
        const edited = run(ch, saved, fee, wso, (row) => {
          const d = sh.days[0]
          row.dailyValues[d] = Number(row.dailyValues[d]) + 1
        })
        assert.equal(qtyOf(edited.applied), qtyOf(saved) + 1)
        assert.ok(Math.abs(cents(edited.grid) - sumCents(edited.applied)) <= edited.applied.bursts.length, `grid ${cents(edited.grid)} vs Apply ${sumCents(edited.applied)}`)
      })
    }
  }
}
const spanQty = (row: any) => (row.mergedWeekSpans ?? []).reduce((t: number, sp: any) => t + sp.totalQty, 0)

test("Radio: a week that already holds day values is not split again, as the grid splits only a week with no day detail (V97 A)", () => {
  // 3 spots Mar 9 to 11 (day cells, week 2); 7 spots Mar 8 to 14 cannot be a
  // span over them and have no other week: a week cell beside the days (the
  // C-368 fallback, still open). Then 2 spots Mar 12 to 13: added to the days;
  // the week cell is left as it was. Untouched exact.
  const radio = CHANNELS.find((c) => c.name === "Radio")!
  const saved = lineOf("spots", false, [
    paid("spots", false, 0, "$1,950.00", "2026-03-09", "2026-03-11"),
    paid("spots", false, 0, "$4,550.00", "2026-03-08", "2026-03-14"),
    paid("spots", false, 0, "$1,300.00", "2026-03-12", "2026-03-13"),
  ])
  const { row, applied } = run(radio, saved, 0, 0)
  assert.equal(row.weeklyValues["2026-03-08"], 7)
  assert.deepEqual(
    Object.fromEntries(Object.entries(row.dailyValues ?? {}).filter(([, v]) => v !== "" && v !== undefined)),
    { "2026-03-09": 1, "2026-03-10": 1, "2026-03-11": 1, "2026-03-12": 1, "2026-03-13": 1 }
  )
  assert.deepEqual(read(applied), read(saved))
})

test("OOH: a sub-week bonus burst in a week whose cell is 0 leaves it (only a week cell with a quantity is split)", () => {
  // 5 paid panels Mar 1 to 14 (a span); a bonus 0 over Mar 8 to 21 leaves 0
  // in week 3; 2 paid panels Mar 16 to 18 open as day cells, the 0 untouched.
  const ooh = CHANNELS.find((c) => c.name === "OOH")!
  const saved = lineOf("panels", false, [
    paid("panels", false, 0, "$7,250.00", "2026-03-01", "2026-03-14"),
    { buyType: "bonus", budget: "0", buyAmount: "0", calculatedValue: 0, startDate: "2026-03-08", endDate: "2026-03-21" },
    paid("panels", false, 0, "$2,900.00", "2026-03-16", "2026-03-18"),
  ])
  const { row, applied } = run(ooh, saved, 0, 0)
  assert.equal(row.weeklyValues["2026-03-15"], 0)
  assert.deepEqual(read(applied), read(saved))
})
