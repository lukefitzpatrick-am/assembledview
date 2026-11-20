import "@/lib/testing/bothZones"
/**
 * C370 (V95 A, C-361 case 1): a burst that lies entirely under spans folds
 * its share into the span over each week, as the grid's merge sums the cells
 * under a span into its total (`handleMergeSelectedWeeks`), when the buy
 * types match. Untouched lines stay exact; an edited span saves what the grid
 * shows. The six spread channels, Sunday and Monday grids, both zones, fee on
 * top and fee-inclusive. Kept apart from `expertCarry.c370.test.ts` so each
 * C370 item can be dropped alone.
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


// --- V95 A (C-361 case 1), the six spread channels ---------------------------------

const SPREAD = CHANNELS.filter((c) => c.spread)
/** Week cells and day cells that sit in a span's weeks: what the grid hides. */
function hiddenQty(row: any, keys: string[]) {
  const under = new Set(keys.filter((k) => (row.mergedWeekSpans ?? []).some((sp: any) => sp.startWeekKey <= k && k <= sp.endWeekKey)))
  const weekOf = (d: string) => [...keys].reverse().find((k) => k <= d)!
  let q = 0
  for (const k of under) q += Number(row.weeklyValues[k] || 0)
  for (const [d, v] of Object.entries(row.dailyValues ?? {})) if (under.has(weekOf(d))) q += Number(v || 0)
  return q
}
const spanTotal = (row: any) => (row.mergedWeekSpans ?? []).reduce((t: number, sp: any) => t + sp.totalQty, 0)
const qtyOf = (line: any) => (line.bursts ?? []).reduce((t: number, b: any) => t + Number(b.calculatedValue || 0), 0)

for (const ch of SPREAD) {
  for (const wso of [0, 1] as const) {
    for (const { incl, fee } of FEES) {
      const tag = `${ch.name}, ${wso ? "Monday" : "Sunday"} grid, ${incl ? "fee-inclusive 12.5%" : "fee on top 0%"}`
      const bt = ch.buyType
      for (const [shape, inner] of [
        ["a full week", ["2026-03-09", "2026-03-15"]],
        ["day cells", ["2026-03-10", "2026-03-12"]],
      ] as const) {
        test(`${tag}: a burst entirely under a span folds into it (${shape}); untouched exact, edited grid = Apply (V95 A)`, () => {
          const saved = lineOf(bt, incl, [paid(bt, incl, fee, "$12,000.00", "2026-03-02", "2026-03-22"), paid(bt, incl, fee, "$2,600.00", inner[0], inner[1])])
          const untouched = run(ch, saved, fee, wso)
          const keys = buildWeeklyGanttColumnsFromCampaign(START, END, wso).map((c) => c.weekKey)
          assert.equal(hiddenQty(untouched.row, keys), 0)
          assert.equal(untouched.row.mergedWeekSpans.length, 1)
          assert.equal(spanTotal(untouched.row), qtyOf(saved))
          assert.deepEqual(read(untouched.applied), read(saved))
          const edited = run(ch, saved, fee, wso, (row) => (row.mergedWeekSpans[0].totalQty += 1))
          assert.equal(qtyOf(edited.applied), qtyOf(saved) + 1)
          assert.ok(Math.abs(cents(edited.grid) - sumCents(edited.applied)) <= edited.applied.bursts.length, `grid ${cents(edited.grid)} vs Apply ${sumCents(edited.applied)}`)
        })
      }

      test(`${tag}: a burst under two spans folds each week's share into the span over it (V95 A)`, () => {
        // On a Monday grid: two spans side by side (Mar 2 to 8, Mar 9 to 22)
        // and a burst Mar 2 to 15 entirely under them. On a Sunday grid the
        // second burst shares week 2 with the first span, so it spreads and
        // the third has a week left: no fold, still exact.
        const saved = lineOf(bt, incl, [
          paid(bt, incl, fee, "$6,500.00", "2026-03-02", "2026-03-08"),
          paid(bt, incl, fee, "$9,100.00", "2026-03-09", "2026-03-22"),
          paid(bt, incl, fee, "$5,200.00", "2026-03-02", "2026-03-15"),
        ])
        const untouched = run(ch, saved, fee, wso)
        const keys = buildWeeklyGanttColumnsFromCampaign(START, END, wso).map((c) => c.weekKey)
        assert.equal(hiddenQty(untouched.row, keys), 0)
        if (wso === 1) {
          // Each span takes the share in its own week, not all of it.
          const [q1, q2] = saved.bursts.map((b: any) => Number(b.calculatedValue))
          assert.deepEqual(untouched.row.mergedWeekSpans.map((sp: any) => sp.totalQty > (sp === untouched.row.mergedWeekSpans[0] ? q1 : q2)), [true, true])
          assert.equal(spanTotal(untouched.row), qtyOf(saved))
        }
        assert.deepEqual(read(untouched.applied), read(saved))
        const edited = run(ch, saved, fee, wso, (row) => (row.mergedWeekSpans[0].totalQty += 1))
        assert.ok(Math.abs(cents(edited.grid) - sumCents(edited.applied)) <= edited.applied.bursts.length, `grid ${cents(edited.grid)} vs Apply ${sumCents(edited.applied)}`)
      })
    }
  }
}

test("OOH: a bonus burst under a paid span does not fold (buy types differ); it stays as before, untouched exact (V95 A)", () => {
  const ooh = CHANNELS.find((c) => c.name === "OOH")!
  const saved = lineOf("panels", false, [
    paid("panels", false, 0, "$10,150.00", "2026-03-01", "2026-03-21"),
    { buyType: "bonus", budget: "0", buyAmount: "0", calculatedValue: 3, startDate: "2026-03-08", endDate: "2026-03-14" },
  ])
  for (const wso of [0, 1] as const) {
    const keys = buildWeeklyGanttColumnsFromCampaign(START, END, wso).map((c) => c.weekKey)
    const { row, applied } = run(ooh, saved, 0, wso)
    assert.equal(spanTotal(row), 7)
    assert.equal(hiddenQty(row, keys), 3)
    assert.deepEqual(read(applied), read(saved))
  }
})

test("OOH: a paid burst under a bonus span does not fold; it stays as before, untouched exact (V95 A)", () => {
  const ooh = CHANNELS.find((c) => c.name === "OOH")!
  const saved = lineOf("panels", false, [
    { buyType: "bonus", budget: "0", buyAmount: "0", calculatedValue: 6, startDate: "2026-03-01", endDate: "2026-03-21" },
    paid("panels", false, 0, "$2,900.00", "2026-03-08", "2026-03-14"),
  ])
  const keys = buildWeeklyGanttColumnsFromCampaign(START, END, 0).map((c) => c.weekKey)
  const { row, applied } = run(ooh, saved, 0, 0)
  assert.deepEqual(row.mergedWeekSpans.map((sp: any) => [sp.totalQty, sp.buyType]), [[6, "bonus"]])
  assert.equal(hiddenQty(row, keys), 2)
  assert.deepEqual(read(applied), read(saved))
})

test("Radio bonus line: days under a span fold into it (V95 A, PGAAUS015 shape), Sunday grid", () => {
  // 8 bonus spots Mon Mar 2 to Sun Mar 8 (a span over weeks 1 and 2); 4 on
  // Mar 9 to 12 sit in week 2, under the span: 12 in the span.
  const radio = CHANNELS.find((c) => c.name === "Radio")!
  const saved = lineOf("bonus", false, [
    { budget: "0", buyAmount: "0", calculatedValue: 8, startDate: "2026-03-02", endDate: "2026-03-08" },
    { budget: "0", buyAmount: "0", calculatedValue: 4, startDate: "2026-03-09", endDate: "2026-03-12" },
  ])
  const { row, applied } = run(radio, saved, 0, 0)
  assert.deepEqual(row.mergedWeekSpans.map((sp: any) => [sp.startWeekKey, sp.endWeekKey, sp.totalQty]), [["2026-03-01", "2026-03-08", 12]])
  assert.deepEqual(Object.values(row.dailyValues ?? {}).filter((v) => v !== "" && v !== undefined), [])
  assert.deepEqual(read(applied), read(saved))
  const edited = run(radio, saved, 0, 0, (r) => (r.mergedWeekSpans[0].totalQty += 1))
  assert.equal(qtyOf(edited.applied), 13)
})

test("Radio: monthly bursts under a campaign-long span fold into it (V95 A, BOSS001 shape)", () => {
  // Jan 1 to Jun 30 opens as a span; April and May lie entirely under it.
  const radio = CHANNELS.find((c) => c.name === "Radio")!
  const S2 = new Date(2026, 0, 1)
  const E2 = new Date(2026, 5, 30)
  const saved = lineOf("spots", false, [
    { budget: "$456.00", buyAmount: "$57.00", calculatedValue: 8, startDate: "2026-01-01", endDate: "2026-06-30" },
    { budget: "$798.00", buyAmount: "$57.00", calculatedValue: 14, startDate: "2026-04-01", endDate: "2026-04-30" },
    { budget: "$798.00", buyAmount: "$57.00", calculatedValue: 14, startDate: "2026-05-01", endDate: "2026-05-31" },
  ])
  for (const wso of [0, 1] as const) {
    const cols = buildWeeklyGanttColumnsFromCampaign(S2, E2, wso)
    const keys = cols.map((c) => c.weekKey)
    const open = () => radio.toExpert([saved], cols, S2, E2, { feePct: 0 })
    const apply = (rows: any[]) => radio.merge(radio.fromExpert(rows, cols, S2, E2, { feePctRadio: 0, budgetIncludesFees: false }), [saved])[0]
    const rows = open()
    assert.deepEqual([spanTotal(rows[0]), hiddenQty(rows[0], keys)], [36, 0])
    assert.deepEqual(read(apply(rows)), read(saved))
    rows[0].mergedWeekSpans[0].totalQty += 1
    const line = apply(rows)
    assert.equal(qtyOf(line), 37)
    assert.ok(Math.abs(cents(expertRowCostSplit(rows[0], keys, 0).raw) - sumCents(line)) <= line.bursts.length)
  }
})

test("OOH, Monday grid: a paid burst under a paid span and a bonus span does not fold at all (V95 A)", () => {
  // Spans: 3 paid Mar 2 to 8, 4 bonus Mar 9 to 22; 2 paid over Mar 2 to 15
  // lie under both. One span takes another buy type, so none of it folds.
  const ooh = CHANNELS.find((c) => c.name === "OOH")!
  const saved = lineOf("panels", false, [
    paid("panels", false, 0, "$4,350.00", "2026-03-02", "2026-03-08"),
    { buyType: "bonus", budget: "0", buyAmount: "0", calculatedValue: 4, startDate: "2026-03-09", endDate: "2026-03-22" },
    paid("panels", false, 0, "$2,900.00", "2026-03-02", "2026-03-15"),
  ])
  const keys = buildWeeklyGanttColumnsFromCampaign(START, END, 1).map((c) => c.weekKey)
  const { row, applied } = run(ooh, saved, 0, 1)
  assert.deepEqual(row.mergedWeekSpans.map((sp: any) => [sp.totalQty, sp.buyType ?? ""]), [[3, ""], [4, "bonus"]])
  assert.equal(hiddenQty(row, keys), 2)
  assert.deepEqual(read(applied), read(saved))
})
