import "@/lib/testing/bothZones"
/**
 * C371 (V106 A, C-371): on the 13 week-cell grids a week cell or day cells in
 * a week under exactly one span fold into that span (the grid's merge sum,
 * `handleMergeSelectedWeeks`), so the grid shows the quantity and an edited
 * Apply writes it. Untouched stays exact. A week under two spans, and a fixed
 * cost line (until V96), are left as before. Live shapes: PGAAUS005 12106
 * (a one-week burst in a span's first week), PENFOLD007 11286 (a burst after
 * the campaign end, keyed to the last week, under a span), glenda007 13214
 * and BOSS002 13186 (day cells under a span on a Monday grid), BOSS010 55351
 * (overlapping spans). Sunday and Monday grids, both zones.
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
type Channel = { name: string; feeKey: string; buyType: string; rate: number; toExpert: AnyFn; fromExpert: AnyFn; merge: AnyFn }

/** The 13 week-cell grids, each on a rate-priced buy type it offers. */
const GRIDS: Channel[] = [
  { name: "Search", feeKey: "feePctSearch", buyType: "cpc", rate: 2, toExpert: M.mapStandardSearchLineItemsToExpertRows, fromExpert: M.mapSearchExpertRowsToStandardLineItems, merge: S.mergeSearchStandardFromExpertWithPrevious },
  { name: "Social", feeKey: "feePctSocial", buyType: "cpc", rate: 2, toExpert: M.mapStandardSocialMediaLineItemsToExpertRows, fromExpert: M.mapSocialMediaExpertRowsToStandardLineItems, merge: S.mergeSocialMediaStandardFromExpertWithPrevious },
  { name: "Influencers", feeKey: "feePctInfluencers", buyType: "cpc", rate: 2, toExpert: M.mapStandardInfluencersLineItemsToExpertRows, fromExpert: M.mapInfluencersExpertRowsToStandardLineItems, merge: S.mergeInfluencersStandardFromExpertWithPrevious },
  { name: "Integration", feeKey: "feePctIntegration", buyType: "cpc", rate: 2, toExpert: M.mapStandardIntegrationLineItemsToExpertRows, fromExpert: M.mapIntegrationExpertRowsToStandardLineItems, merge: S.mergeIntegrationStandardFromExpertWithPrevious },
  { name: "Digital Video", feeKey: "feePctDigiVideo", buyType: "cpv", rate: 2, toExpert: M.mapStandardDigiVideoLineItemsToExpertRows, fromExpert: M.mapDigiVideoExpertRowsToStandardLineItems, merge: S.mergeDigiVideoStandardFromExpertWithPrevious },
  { name: "Digital Display", feeKey: "feePctDigiDisplay", buyType: "cpc", rate: 2, toExpert: M.mapStandardDigiDisplayLineItemsToExpertRows, fromExpert: M.mapDigitalDisplayExpertRowsToStandardLineItems, merge: S.mergeDigiDisplayStandardFromExpertWithPrevious },
  { name: "Newspaper", feeKey: "feePctNewspaper", buyType: "insertions", rate: 2, toExpert: M.mapStandardNewspaperLineItemsToExpertRows, fromExpert: M.mapNewspaperExpertRowsToStandardLineItems, merge: S.mergeNewspaperStandardFromExpertWithPrevious },
  { name: "Magazines", feeKey: "feePctMagazines", buyType: "insertions", rate: 2, toExpert: M.mapStandardMagazineLineItemsToExpertRows, fromExpert: M.mapMagazineExpertRowsToStandardLineItems, merge: S.mergeMagazineStandardFromExpertWithPrevious },
  { name: "Prog Display", feeKey: "feePctProgDisplay", buyType: "cpc", rate: 2, toExpert: M.mapStandardProgDisplayLineItemsToExpertRows, fromExpert: M.mapProgDisplayExpertRowsToStandardLineItems, merge: S.mergeProgDisplayStandardFromExpertWithPrevious },
  { name: "Prog Video", feeKey: "feePctProgVideo", buyType: "cpc", rate: 2, toExpert: M.mapStandardProgVideoLineItemsToExpertRows, fromExpert: M.mapProgVideoExpertRowsToStandardLineItems, merge: S.mergeProgVideoStandardFromExpertWithPrevious },
  { name: "Prog BVOD", feeKey: "feePctProgBvod", buyType: "cpc", rate: 2, toExpert: M.mapStandardProgBvodLineItemsToExpertRows, fromExpert: M.mapProgBvodExpertRowsToStandardLineItems, merge: S.mergeProgBvodStandardFromExpertWithPrevious },
  { name: "Prog Audio", feeKey: "feePctProgAudio", buyType: "cpc", rate: 2, toExpert: M.mapStandardProgAudioLineItemsToExpertRows, fromExpert: M.mapProgAudioExpertRowsToStandardLineItems, merge: S.mergeProgAudioStandardFromExpertWithPrevious },
  { name: "Prog OOH", feeKey: "feePctProgOoh", buyType: "cpc", rate: 2, toExpert: M.mapStandardProgOohLineItemsToExpertRows, fromExpert: M.mapProgOohExpertRowsToStandardLineItems, merge: S.mergeProgOohStandardFromExpertWithPrevious },
]

const START = new Date(2026, 2, 2)
const END = new Date(2026, 3, 4)
const FEES = [
  { incl: false, fee: 0 },
  { incl: true, fee: 12.5 },
] as const
const day = (d: unknown) => (d instanceof Date ? format(d, "yyyy-MM-dd") : formatBurstDateLocal(String(d ?? "")))
const read = (line: any) => [...(line.bursts ?? [])].map((b: any) => [toCents(parseBurstMoney(b.budget)), Number(b.calculatedValue), `${day(b.startDate)}..${day(b.endDate)}`] as const).sort((a, b) => a[2].localeCompare(b[2]) || a[0] - b[0])
const sumCents = (line: any) => read(line).reduce((s, b) => s + b[0], 0)
const lineOf = (buyType: string, incl: boolean, bursts: any[]) => ({ buyType, budgetIncludesFees: incl, clientPaysForMedia: false, fixedCostMedia: false, noadserving: false, line_item_id: "c371f", lineItemId: "c371f", line_item: 1, lineItem: 1, bursts })
const burst = (rate: number, qty: number, startDate: string, endDate: string) => ({ budget: String(rate * qty), buyAmount: String(rate), calculatedValue: qty, startDate, endDate })
/** Week cells and day cells holding a quantity under a span: what the grid hides. */
const hidden = (row: any) => {
  const keys = Object.keys(row.weeklyValues).sort()
  const under = (k: string) => (row.mergedWeekSpans ?? []).some((sp: any) => sp.startWeekKey <= k && k <= sp.endWeekKey)
  const weekOf = (d: string) => [...keys].reverse().find((k) => k <= d)!
  return [...keys.filter((k) => Number(row.weeklyValues[k]) > 0 && under(k)), ...Object.keys(row.dailyValues ?? {}).filter((d) => Number(row.dailyValues[d]) > 0 && under(weekOf(d)))]
}

function run(ch: Channel, saved: any, fee: number, wso: 0 | 1, edit?: (row: any) => void) {
  const cols = buildWeeklyGanttColumnsFromCampaign(START, END, wso)
  const rows = ch.toExpert([saved], cols, START, END)
  edit?.(rows[0])
  const grid = toCents(expertRowCostSplit(rows[0], cols.map((c) => c.weekKey), fee).raw)
  const applied = ch.merge(ch.fromExpert(rows, cols, START, END, { [ch.feeKey]: fee, budgetIncludesFees: Boolean(saved.budgetIncludesFees) }), [saved])[0]
  return { row: rows[0] as any, grid, applied }
}
const bumpSpan = (i: number) => (row: any) => (row.mergedWeekSpans[i].totalQty += 1)
const gridEqualsApply = (r: { grid: number; applied: any }) =>
  assert.ok(Math.abs(r.grid - sumCents(r.applied)) <= r.applied.bursts.length, `grid ${r.grid} vs Apply ${sumCents(r.applied)}`)

for (const ch of GRIDS) {
  for (const wso of [0, 1] as const) {
    for (const { incl, fee } of FEES) {
      const tag = `${ch.name}, ${wso ? "Monday" : "Sunday"} grid, ${incl ? "fee-inclusive 12.5%" : "fee 0"}`
      const r = ch.rate

      test(`${tag}: a burst after the campaign end, in the last week under a span, folds into the span; untouched exact, edited grid = Apply (PENFOLD007 11286 shape, V106 A)`, () => {
        const saved = lineOf(ch.buyType, incl, [burst(r, 1000, "2026-03-05", "2026-04-04"), burst(r, 300, "2026-04-27", "2026-04-29")])
        const untouched = run(ch, saved, fee, wso)
        assert.deepEqual(hidden(untouched.row), [])
        assert.deepEqual(untouched.row.mergedWeekSpans.map((sp: any) => sp.totalQty), [1300])
        assert.deepEqual(read(untouched.applied), read(saved))
        const edited = run(ch, saved, fee, wso, bumpSpan(0))
        gridEqualsApply(edited)
        assert.deepEqual(read(edited.applied).map((b) => b[1]), [1301])
      })

      test(`${tag}: a sub-week burst in a span's first week folds into the span; untouched exact, edited grid = Apply (PGAAUS005 12106 shape, V106 A)`, () => {
        const saved = lineOf(ch.buyType, incl, [burst(r, 500, "2026-03-02", "2026-03-04"), burst(r, 1000, "2026-03-05", "2026-03-31")])
        const untouched = run(ch, saved, fee, wso)
        assert.deepEqual(hidden(untouched.row), [])
        assert.deepEqual(read(untouched.applied), read(saved))
        const edited = run(ch, saved, fee, wso, bumpSpan(0))
        gridEqualsApply(edited)
        assert.equal(read(edited.applied).reduce((q, b) => q + b[1], 0), 1501)
      })
    }
  }
}

for (const wso of [0, 1] as const) {
  const grid = wso ? "Monday" : "Sunday"
  const search = GRIDS[0]!

  test(`Search, ${grid} grid: a one-day burst on the span's last day folds its day cell into the span (glenda007 13214 shape, V106 A)`, () => {
    // Mar 29 is a Sunday: on a Monday grid it sits in the span's last week as a day cell.
    const saved = lineOf("cpc", false, [burst(2, 4500, "2026-03-03", "2026-03-28"), burst(2, 4500, "2026-03-29", "2026-03-29")])
    const untouched = run(search, saved, 0, wso)
    assert.deepEqual(hidden(untouched.row), [])
    assert.deepEqual(read(untouched.applied), read(saved))
    const edited = run(search, saved, 0, wso, bumpSpan(0))
    gridEqualsApply(edited)
  })

  test(`Search, ${grid} grid: a week cell under two overlapping spans is left as before (BOSS010 55351 has such spans; the grid never makes them)`, () => {
    const cols = buildWeeklyGanttColumnsFromCampaign(START, END, wso)
    const k = cols.map((c) => c.weekKey)
    // Two spans sharing week 2 and a one-day burst in week 2.
    const saved = lineOf("cpc", false, [burst(2, 100, `${k[0]}`, `${k[1]}`), burst(2, 100, `${k[1]}`, `${k[2]}`), burst(2, 7, `${k[1]}`, `${k[1]}`)])
    const { row } = run(search, saved, 0, wso)
    assert.equal(row.mergedWeekSpans.length, 2)
    assert.deepEqual(row.mergedWeekSpans.map((sp: any) => sp.totalQty), [100, 100])
    assert.equal(hidden(row).length, 1)
  })

  test(`Search, ${grid} grid: a fixed cost line is left as before until V96 (C-369)`, () => {
    const saved = lineOf("fixed_cost", false, [burst(5000, 1, "2026-03-05", "2026-04-04"), burst(3000, 1, "2026-04-27", "2026-04-29")])
    const { row, applied } = run(search, saved, 0, wso)
    assert.deepEqual(row.mergedWeekSpans.map((sp: any) => sp.totalQty), [1])
    assert.equal(hidden(row).length, 1)
    assert.deepEqual(read(applied), read(saved))
  })
}

for (const wso of [0, 1] as const) {
  test(`Digital Display, ${wso ? "Monday" : "Sunday"} grid: the card's lump sum in week 1 is not a burst and does not fold into a 0 span; untouched exact (golf007 10735 shape, C-373)`, () => {
    const saved = lineOf("cpc", false, [{ budget: "$7,500.00", buyAmount: "$5.30", calculatedValue: 0, startDate: "2026-03-05", endDate: "2026-03-31" }])
    const { row, applied } = run(GRIDS[5]!, saved, 0, wso)
    assert.deepEqual(row.mergedWeekSpans.map((sp: any) => sp.totalQty), [0])
    assert.equal(hidden(row).length, 1)
    assert.deepEqual(read(applied), read(saved))
  })
}
