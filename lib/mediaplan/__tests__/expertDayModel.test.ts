import { test } from "node:test"
import assert from "node:assert/strict"
import {
  buildDayColumnsForWeek,
  expandWeekToDaily,
  collapseDailyToWeekly,
  weekIsUniform,
  emitDayBurstsForWeek,
  resizeSpanWeeks,
  rebucketWeeklyValues,
  rebucketRowsForWeekStartsOn,
  spreadMergedSpanAcrossWeekColumns,
} from "@/lib/mediaplan/expertDayModel"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

const CS = new Date(2026, 0, 4)   // Sun 4 Jan 2026
const CE = new Date(2026, 0, 31)  // 4 weeks
const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)
const week0 = cols[0]!
const dk = buildDayColumnsForWeek(week0, CS, CE).map((d) => d.dayKey)

test("full interior week yields 7 day columns", () => {
  assert.equal(dk.length, 7)
})

test("expand → collapse round-trips the total", () => {
  const daily = expandWeekToDaily(10, dk) // 7 days: 2,2,2,1,1,1,1
  assert.equal(collapseDailyToWeekly(daily, dk), 10)
  assert.equal(weekIsUniform(daily, dk), false) // 10/7 is not even → non-uniform
})

test("even split is uniform and collapses", () => {
  const daily = expandWeekToDaily(14, dk) // 2 each
  assert.equal(weekIsUniform(daily, dk), true)
  assert.equal(collapseDailyToWeekly(daily, dk), 14)
})

test("emit: uniform run = 1 burst; gap splits into 2", () => {
  const dcs = buildDayColumnsForWeek(week0, CS, CE)
  const daily: Record<string, number | ""> = {}
  // Mon–Tue = 3 each, Wed empty, Thu–Fri = 3 each
  daily[dk[1]!] = 3; daily[dk[2]!] = 3; daily[dk[4]!] = 3; daily[dk[5]!] = 3
  const bursts = emitDayBurstsForWeek(dcs, daily)
  assert.equal(bursts.length, 2)
  assert.equal(bursts[0]!.qty, 6) // 3×2 days
  assert.equal(bursts[1]!.qty, 6)
})

test("emit: non-uniform adjacent days = separate bursts", () => {
  const dcs = buildDayColumnsForWeek(week0, CS, CE)
  const daily: Record<string, number | ""> = {}
  daily[dk[1]!] = 2; daily[dk[2]!] = 3
  const bursts = emitDayBurstsForWeek(dcs, daily)
  assert.equal(bursts.length, 2)
  assert.equal(bursts[0]!.qty, 2)
  assert.equal(bursts[1]!.qty, 3)
})

test("resizeSpanWeeks grows/shrinks and clamps", () => {
  const keys = cols.map((c) => c.weekKey)
  assert.deepEqual(
    resizeSpanWeeks(keys, keys[1]!, keys[2]!, "end", 1),
    { startWeekKey: keys[1]!, endWeekKey: keys[3]! }
  )
  assert.deepEqual(
    resizeSpanWeeks(keys, keys[1]!, keys[2]!, "start", -5), // clamp to 0
    { startWeekKey: keys[0]!, endWeekKey: keys[2]! }
  )
  assert.equal(resizeSpanWeeks(keys, keys[1]!, keys[2]!, "end", -5), null) // ns>ne invalid
})

test("rebucketWeeklyValues is a no-op on empty grid", () => {
  const sunCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 0)
  const monCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 1)
  const empty: Record<string, number | ""> = {}
  for (const c of sunCols) empty[c.weekKey] = ""
  assert.deepEqual(rebucketWeeklyValues(empty, sunCols, monCols, CS, CE), {})
})

test("rebucketWeeklyValues preserves per-row totals across weekStartsOn change including boundary-spanning value", () => {
  const sunCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 0)
  const monCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 1)
  // Put 70 on Sunday week starting 2026-01-04 (Sun–Sat) — spans Mon tiling.
  const old: Record<string, number | ""> = {}
  for (const c of sunCols) old[c.weekKey] = ""
  old[sunCols[0]!.weekKey] = 70

  const next = rebucketWeeklyValues(old, sunCols, monCols, CS, CE)
  const oldTotal = Object.values(old).reduce<number>(
    (s, v) => s + (typeof v === "number" ? v : 0),
    0
  )
  const newTotal = Object.values(next).reduce<number>(
    (s, v) => s + (typeof v === "number" ? v : 0),
    0
  )
  assert.equal(newTotal, oldTotal)
  // Sun week 4–10 overlaps Mon weeks: Dec29–Jan4 (1 day) and Jan5–11 (6 days)
  assert.equal(next["2025-12-29"], 10) // 70 * 1/7
  assert.equal(next["2026-01-05"], 60) // 70 * 6/7
})

test("rebucketRowsForWeekStartsOn keeps an undated span and remaps its column edges", () => {
  const sunCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 0)
  const monCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 1)
  const weeklyValues: Record<string, number | ""> = {}
  for (const c of sunCols) weeklyValues[c.weekKey] = ""
  const rows = [
    {
      weeklyValues,
      mergedWeekSpans: [
        {
          startWeekKey: sunCols[0]!.weekKey,
          endWeekKey: sunCols[1]!.weekKey,
          totalQty: 140,
        },
      ],
    },
  ]
  const next = rebucketRowsForWeekStartsOn(rows, sunCols, monCols, CS, CE)
  const span = next[0]!.mergedWeekSpans?.[0]
  assert.ok(span)
  assert.equal(next[0]!.mergedWeekSpans?.length, 1)
  assert.equal(span.totalQty, 140)
  const dated = span as { startYmd?: string; endYmd?: string }
  assert.equal(dated.startYmd, undefined)
  assert.equal(dated.endYmd, undefined)
  // Sunday week 4–10 Jan starts 4 Jan; week 11–17 Jan ends 17 Jan.
  // Monday columns containing those days are 29 Dec and 12 Jan.
  assert.equal(span.startWeekKey, "2025-12-29")
  assert.equal(span.endWeekKey, "2026-01-12")
  const cellTotal = Object.values(next[0]!.weeklyValues).reduce<number>(
    (s, v) => s + (typeof v === "number" ? v : 0),
    0
  )
  assert.equal(cellTotal, 0)
})

function sumWeekly(values: Record<string, number | "">): number {
  return Object.values(values).reduce<number>(
    (s, v) => s + (typeof v === "number" ? v : 0),
    0
  )
}

function assertWholeUnits(values: Record<string, number | "">): void {
  for (const v of Object.values(values)) {
    if (v === "") continue
    assert.equal(typeof v, "number")
    assert.equal(v, Math.round(Number(v)))
  }
}

test("plain weekly cells ignore days outside the campaign and stay whole units", () => {
  const start = new Date(2026, 10, 15)
  const end = new Date(2026, 11, 20)
  const sunCols = buildWeeklyGanttColumnsFromCampaign(start, end, 0)
  const monCols = buildWeeklyGanttColumnsFromCampaign(start, end, 1)
  const weeklyValues: Record<string, number | ""> = {}
  for (const c of sunCols) weeklyValues[c.weekKey] = ""
  // Last Sunday column is 20–26 Dec; only 20 Dec is inside the campaign.
  weeklyValues[sunCols[sunCols.length - 1]!.weekKey] = 100

  const [toMonday] = rebucketRowsForWeekStartsOn(
    [{ weeklyValues, mergedWeekSpans: [] }],
    sunCols,
    monCols,
    start,
    end
  )
  assert.ok(toMonday)
  assert.equal(sumWeekly(toMonday.weeklyValues), 100)
  assert.equal(toMonday.weeklyValues["2026-12-14"], 100)
  assertWholeUnits(toMonday.weeklyValues)

  const [back] = rebucketRowsForWeekStartsOn(
    [toMonday],
    monCols,
    sunCols,
    start,
    end
  )
  assert.ok(back)
  assert.equal(sumWeekly(back.weeklyValues), 100)
  assertWholeUnits(back.weeklyValues)
})

test("plain weekly cells toggled Sunday to Monday to Sunday keep the total with no decimals", () => {
  const sunCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 0)
  const monCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 1)
  const weeklyValues: Record<string, number | ""> = {}
  for (const c of sunCols) weeklyValues[c.weekKey] = ""
  weeklyValues[sunCols[0]!.weekKey] = 10

  const [toMonday] = rebucketRowsForWeekStartsOn(
    [{ weeklyValues, mergedWeekSpans: [] }],
    sunCols,
    monCols,
    CS,
    CE
  )
  assert.ok(toMonday)
  assert.equal(sumWeekly(toMonday.weeklyValues), 10)
  assertWholeUnits(toMonday.weeklyValues)
  // 10 across Sun 4–10 Jan: first 3 days get 2, so Mon week 29 Dec gets 4 Jan only.
  assert.equal(toMonday.weeklyValues["2025-12-29"], 2)
  assert.equal(toMonday.weeklyValues["2026-01-05"], 8)

  const [back] = rebucketRowsForWeekStartsOn(
    [toMonday],
    monCols,
    sunCols,
    CS,
    CE
  )
  assert.ok(back)
  assert.equal(sumWeekly(back.weeklyValues), 10)
  assertWholeUnits(back.weeklyValues)
})

test("krusty002 span weekly totals spread 500,000 by burst days", () => {
  const start = new Date(2026, 10, 15)
  const end = new Date(2026, 11, 20)
  const span = {
    totalQty: 500_000,
    startWeekKey: "2026-11-15",
    endWeekKey: "2026-12-20",
    startYmd: "2026-11-15",
    endYmd: "2026-12-20",
  }
  const sunday = buildWeeklyGanttColumnsFromCampaign(start, end, 0)
  const monday = buildWeeklyGanttColumnsFromCampaign(start, end, 1)
  const sundayTotals = sunday.map(
    (col) => spreadMergedSpanAcrossWeekColumns(span, sunday, start, end)[col.weekKey] ?? 0
  )
  const mondayTotals = monday.map(
    (col) => spreadMergedSpanAcrossWeekColumns(span, monday, start, end)[col.weekKey] ?? 0
  )
  assert.deepEqual(sundayTotals, [97223, 97223, 97223, 97223, 97220, 13888])
  assert.deepEqual(mondayTotals, [13889, 97223, 97223, 97223, 97223, 97219])
  assert.equal(
    sundayTotals.reduce((s, n) => s + n, 0),
    500_000
  )
  assert.equal(
    mondayTotals.reduce((s, n) => s + n, 0),
    500_000
  )
})
