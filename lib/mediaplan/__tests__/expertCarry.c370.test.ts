import "@/lib/testing/bothZones"
/**
 * C370 (V99 A, C-370): a saved burst the expert grid cannot place comes back
 * on Apply exactly as saved, outside every group, edited or not.
 *
 * - No cell: no campaign week (a burst after the campaign end), or no
 *   quantity any import can open (0 deliverables with a $0.00 rate or a $0.00
 *   budget). The planner cannot edit it, so it is never priced from the grid.
 * - A bonus or package inclusions burst saved with a blank budget counts as
 *   carried, like one saved with $0.
 * - The grid's money counts the burst's saved budget, so an edited row's
 *   money is what Apply saves (a cent per burst of rounding).
 * - A backstop: when a week no other burst touches holds a quantity (the
 *   card's lump sum put in the first week), nothing is given back twice.
 *
 * Every grid (20), Sunday and Monday weeks, both zones. The round trip
 * (`expertApplyRoundTrip.c342.test.ts`) still pins every placed burst.
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
const flags = (l: any) => [l.buyType, !!l.clientPaysForMedia, !!l.budgetIncludesFees, !!(l.noadserving ?? l.noAdserving), !!l.fixedCostMedia].join("/")

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

/** Double the quantity in the week that holds `ymd`: its week cell, the span that covers it, or its day cells. */
function doubleWeek(row: any, keys: string[], ymd: string) {
  const k = [...keys].reverse().find((w) => w <= ymd)!
  const cell = row.weeklyValues[k]
  if (cell !== "" && cell !== undefined && Number(cell) !== 0) {
    row.weeklyValues[k] = Number(cell) * 2
    return
  }
  const span = (row.mergedWeekSpans ?? []).find((sp: any) => sp.startWeekKey <= k && k <= sp.endWeekKey)
  if (span) {
    span.totalQty *= 2
    return
  }
  const next = keys[keys.indexOf(k) + 1] ?? "9999"
  const days = Object.keys(row.dailyValues ?? {}).filter((d) => d >= k && d < next)
  assert.ok(days.length > 0, `no quantity in week ${k}`)
  for (const d of days) row.dailyValues[d] = Number(row.dailyValues[d]) * 2
}

const sumCents = (line: any) => read(line).reduce((s, b) => s + b[0], 0)

for (const ch of CHANNELS) {
  for (const wso of [0, 1] as const) {
    for (const { incl, fee } of FEES) {
      const tag = `${ch.name}, ${wso ? "Monday" : "Sunday"} grid, ${incl ? "fee-inclusive 12.5%" : "fee on top 0%"}`
      const bt = ch.buyType

      const late = paid(bt, incl, fee, "$19,125.00", "2026-04-05", "2026-04-30")
      const lateLine = lineOf(bt, incl, [paid(bt, incl, fee, "$12,000.00", "2026-03-01", "2026-03-14"), late])
      const gridEqualsApply = (r: { grid: number; applied: any }) =>
        assert.ok(Math.abs(cents(r.grid) - sumCents(r.applied)) <= r.applied.bursts.length, `grid ${cents(r.grid)} vs Apply ${sumCents(r.applied)}`)

      test(`${tag}: a burst after the campaign end comes back as saved untouched, and when another week is edited (C-370)`, () => {
        const untouched = run(ch, lateLine, fee, wso)
        assert.deepEqual(read(untouched.applied), read(lateLine))
        assert.equal(flags(untouched.applied), flags(lateLine))
        assert.equal(cents(untouched.grid), 3_112_500)
        const edited = run(ch, lateLine, fee, wso, (row, keys) => doubleWeek(row, keys, "2026-03-01"))
        assert.deepEqual(read(edited.applied).filter((b) => b[4] === "2026-04-05..2026-04-30"), read(lineOf(bt, incl, [late])))
        gridEqualsApply(edited)
        assert.ok(sumCents(edited.applied) > 3_112_500)
      })

      if (ch.spread) {
        test(`${tag}: a burst after the campaign end has no cell, so it comes back as saved whatever is edited (C-370)`, () => {
          // The planner types 5 into the empty last week, where the import put nothing.
          const edited = run(ch, lateLine, fee, wso, (row, keys) => (row.weeklyValues[keys[keys.length - 1]!] = 5))
          assert.ok(read(edited.applied).some((b) => b[4] === "2026-04-05..2026-04-30" && b[0] === 1_912_500))
          gridEqualsApply(edited)
        })
      } else {
        test(`${tag}: a burst after the campaign end opens in the last week, so editing that week prices it from the grid (C-370)`, () => {
          const edited = run(ch, lateLine, fee, wso, (row, keys) => doubleWeek(row, keys, "2026-03-28"))
          assert.ok(!read(edited.applied).some((b) => b[4] === "2026-04-05..2026-04-30"))
          gridEqualsApply(edited)
        })
      }

      test(`${tag}: a burst saved with a budget, a $0.00 rate and 0 deliverables comes back as saved, edited or not (C-370)`, () => {
        const zero = { budget: "$684.00", buyAmount: "$0.00", calculatedValue: 0, startDate: "2026-03-08", endDate: "2026-03-14" }
        const saved = lineOf(bt, incl, [paid(bt, incl, fee, "$7,777.77", "2026-03-01", "2026-03-07"), zero, paid(bt, incl, fee, "$5,200.00", "2026-03-15", "2026-03-28")])
        const untouched = run(ch, saved, fee, wso)
        assert.deepEqual(read(untouched.applied), read(saved))
        assert.equal(cents(untouched.grid), 777_777 + 68_400 + 520_000)
        const edited = run(ch, saved, fee, wso, (row, keys) => doubleWeek(row, keys, "2026-03-22"))
        assert.deepEqual(read(edited.applied).filter((b) => b[0] === 68_400), read(lineOf(bt, incl, [zero])))
        assert.ok(Math.abs(cents(edited.grid) - sumCents(edited.applied)) <= edited.applied.bursts.length, `grid ${cents(edited.grid)} vs Apply ${sumCents(edited.applied)}`)
      })

      test(`${tag}: a $0 line with 0 deliverables keeps its bursts, not one campaign burst (C-370)`, () => {
        const saved = lineOf(bt, incl, [
          { budget: "0", buyAmount: "0", calculatedValue: 0, startDate: "2026-03-02", endDate: "2026-03-07" },
          { budget: "0", buyAmount: "4", calculatedValue: 0, startDate: "2026-03-08", endDate: "2026-03-14" },
          { budget: "0", buyAmount: "0", calculatedValue: 0, startDate: "2026-03-15", endDate: "2026-03-21" },
        ])
        const untouched = run(ch, saved, fee, wso)
        assert.deepEqual(read(untouched.applied), read(saved))
        assert.equal(untouched.grid, 0)
      })

      if (ch.bonus) {
        test(`${tag}: bonus bursts saved with a blank budget come back as saved (C-370)`, () => {
          const saved = lineOf("bonus", incl, [
            { budget: "0", buyAmount: "0", calculatedValue: 12, startDate: "2026-03-01", endDate: "2026-03-14" },
            { budget: "", buyAmount: "", calculatedValue: 5, startDate: "2026-03-15", endDate: "2026-03-28" },
          ])
          const untouched = run(ch, saved, fee, wso)
          assert.deepEqual(read(untouched.applied), read(saved))
        })

        test(`${tag}: bonus bursts saved with 0 come back as saved, with no buy type written (C-370)`, () => {
          const saved = lineOf("bonus", incl, [
            { budget: "0", buyAmount: "0", calculatedValue: 0, startDate: "2026-03-08", endDate: "2026-03-14" },
            { budget: "0", buyAmount: "0", calculatedValue: 0, startDate: "2026-03-22", endDate: "2026-03-22" },
          ])
          assert.deepEqual(read(run(ch, saved, fee, wso).applied), read(saved))
        })
      }
    }
  }
}

test("OOH: bonus bursts of 0 on a panels line, one starting before the campaign, come back as saved (C-370, penfold026 shape)", () => {
  const ooh = CHANNELS.find((c) => c.name === "OOH")!
  const saved = lineOf("panels", false, [
    { buyType: "bonus", budget: "0", buyAmount: "0", calculatedValue: 0, startDate: "2026-02-28", endDate: "2026-03-06" },
    { buyType: "bonus", budget: "0", buyAmount: "0", calculatedValue: 0, startDate: "2026-03-07", endDate: "2026-03-13" },
  ])
  for (const wso of [0, 1] as const) assert.deepEqual(read(run(ooh, saved, 0, wso).applied), read(saved))
})

test("Radio: monthly bursts with a December burst at a $0.00 rate (C-370, BOSS001 shape): exact, and the $684.00 stays when November is edited", () => {
  const radio = CHANNELS.find((c) => c.name === "Radio")!
  const START2 = new Date(2025, 8, 1)
  const END2 = new Date(2026, 5, 30)
  const months = [
    ["$1,197.00", "$57.00", 21, "2025-11-01", "2025-11-30"],
    ["$684.00", "$0.00", 0, "2025-12-01", "2025-12-31"],
    ["$342.00", "$57.00", 6, "2026-01-01", "2026-01-31"],
  ] as const
  const saved = lineOf("spots", false, months.map(([budget, buyAmount, calculatedValue, startDate, endDate]) => ({ budget, buyAmount, calculatedValue, startDate, endDate })))
  for (const wso of [0, 1] as const) {
    const cols = buildWeeklyGanttColumnsFromCampaign(START2, END2, wso)
    const keys = cols.map((c) => c.weekKey)
    const apply = (edit?: (row: any) => void) => {
      const rows = radio.toExpert([saved], cols, START2, END2, { feePct: 0 })
      edit?.(rows[0])
      return { grid: expertRowCostSplit(rows[0], keys, 0).raw, line: radio.merge(radio.fromExpert(rows, cols, START2, END2, { feePctRadio: 0, budgetIncludesFees: false }), [saved])[0] }
    }
    const untouched = apply()
    assert.deepEqual(read(untouched.line), read(saved))
    assert.equal(cents(untouched.grid), 222_300)
    const edited = apply((row) => doubleWeek(row, keys, "2025-11-09"))
    assert.deepEqual(read(edited.line).filter((b) => b[0] === 68_400), [[68_400, "string", 0, 0, "2025-12-01..2025-12-31", ""]])
    assert.ok(Math.abs(cents(edited.grid) - sumCents(edited.line)) <= edited.line.bursts.length)
  }
})

test("Production: a burst after the campaign end comes back as saved, edited or not (C-370)", () => {
  const saved: any = {
    mediaType: "Production",
    publisher: "Studio",
    description: "Edit",
    market: "National",
    unitRate: 1234.56,
    line_item_id: "c370Production",
    lineItemId: "c370Production",
    line_item: 1,
    lineItem: 1,
    bursts: [
      { cost: 1234.56, amount: 3, budget: "$3,703.68", buyAmount: "3", calculatedValue: 3, startDate: "2026-03-01", endDate: "2026-03-14" },
      { cost: 1234.56, amount: 2, budget: "$2,469.12", buyAmount: "2", calculatedValue: 2, startDate: "2026-04-05", endDate: "2026-04-30" },
    ],
  }
  const cols = buildWeeklyGanttColumnsFromCampaign(START, END)
  const keys = cols.map((c) => c.weekKey)
  const apply = (edit?: (row: any) => void) => {
    const rows = M.mapStandardProductionLineItemsToExpertRows([saved], cols, START, END)
    edit?.(rows[0])
    return S.mergeProductionStandardFromExpertWithPrevious(M.mapProductionExpertRowsToStandardLineItems(rows, cols, START, END), [saved])[0] as any
  }
  const shape = (l: any) => [...l.bursts].map((b: any) => [b.cost, b.amount, cents(parseBurstMoney(b.budget)), day(b.startDate), day(b.endDate)]).sort((a, b) => String(a[3]).localeCompare(String(b[3])))
  assert.deepEqual(shape(apply()), shape(saved))
  const edited = shape(apply((row) => doubleWeek(row, keys, "2026-03-01")))
  assert.deepEqual(edited[edited.length - 1], [1234.56, 2, 246_912, "2026-04-05", "2026-04-30"])
})

test("Search: a lump sum the card put in the first week is not given back twice (C-370 backstop)", () => {
  // One burst: a budget, no rate, no deliverables. The import places nothing,
  // so the card's lump sum opens as 1 at $700.00 in the first week; that is
  // the burst's money on the grid, and Apply writes it once.
  const search = CHANNELS.find((c) => c.name === "Search")!
  const saved = lineOf("cpc", false, [{ budget: "7", buyAmount: "", calculatedValue: 0, startDate: "2026-03-15", endDate: "2026-03-21" }])
  for (const wso of [0, 1] as const) {
    const { grid, applied } = run(search, saved, 0, wso)
    assert.equal(cents(grid), 700)
    assert.equal(sumCents(applied), 700)
  }
})

// --- Pins added after mutation testing ---------------------------------------------

test("Search: a burst before the campaign opens in the first week and comes back as saved (C-370, outsideToEdgeWeek)", () => {
  const search = CHANNELS.find((c) => c.name === "Search")!
  const saved = lineOf("cpc", false, [paid("cpc", false, 0, "$1,000.00", "2026-02-01", "2026-02-20"), paid("cpc", false, 0, "$2,000.00", "2026-03-15", "2026-03-28")])
  for (const wso of [0, 1] as const) assert.deepEqual(read(run(search, saved, 0, wso).applied), read(saved))
})

test("Radio: a fixed cost line whose only burst is after the campaign shows its saved budget, not that plus its rate (C-370)", () => {
  const radio = CHANNELS.find((c) => c.name === "Radio")!
  const saved = lineOf("fixed_cost", false, [{ budget: "$5,000.00", buyAmount: "$5,000.00", calculatedValue: 1, startDate: "2026-04-05", endDate: "2026-04-30" }])
  for (const wso of [0, 1] as const) {
    const { grid, applied } = run(radio, saved, 0, wso)
    assert.equal(cents(grid), 500_000)
    assert.deepEqual(read(applied), read(saved))
  }
})

test("Radio: a burst the grid cannot place keeps its own blank rate, not another burst's (C-370)", () => {
  const radio = CHANNELS.find((c) => c.name === "Radio")!
  const saved = lineOf("spots", false, [
    { budget: "$1,197.00", buyAmount: "$57.00", calculatedValue: 21, startDate: "2026-03-01", endDate: "2026-03-14" },
    { budget: "$684.00", buyAmount: "", calculatedValue: 0, startDate: "2026-03-15", endDate: "2026-03-21" },
  ])
  const zero = run(radio, saved, 0, 0).applied.bursts.find((b: any) => toCents(parseBurstMoney(b.budget)) === 68_400)
  assert.equal(zero.buyAmount, "")
})

test("Search: a package inclusions burst saved with 0 that shares a week opens as 1 and is priced from the grid once edited, never also given back (C-370)", () => {
  // The week-cell grids open package inclusions 0 as 1, so it is not a burst
  // the grid cannot place: an edited group writes only what the grid shows.
  const search = CHANNELS.find((c) => c.name === "Search")!
  const saved = lineOf("package_inclusions", false, [
    { budget: "0", buyAmount: "0", calculatedValue: 2, startDate: "2026-03-01", endDate: "2026-03-14" },
    { budget: "0", buyAmount: "0", calculatedValue: 0, startDate: "2026-03-08", endDate: "2026-03-14" },
  ])
  const edited = run(search, saved, 0, 0, (row, keys) => doubleWeek(row, keys, "2026-03-01"))
  // C371 (V106 A): its 1, in a week under the span, folds into the span (2 + 1), so the grid shows one
  // span and no week cell, and Apply writes that one span's burst.
  assert.deepEqual(edited.row.mergedWeekSpans.map((sp: any) => sp.totalQty), [6])
  assert.equal(Object.values(edited.row.weeklyValues).filter((v: any) => Number(v) > 0).length, 0)
  assert.equal(edited.applied.bursts.length, 1)
  assert.ok(!edited.applied.bursts.some((b: any) => Number(b.calculatedValue) === 0))
})
