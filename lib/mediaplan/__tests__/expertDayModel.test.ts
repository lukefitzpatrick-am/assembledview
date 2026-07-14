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
  assert.deepEqual(rebucketWeeklyValues(empty, sunCols, monCols), {})
})

test("rebucketWeeklyValues preserves per-row totals across weekStartsOn change including boundary-spanning value", () => {
  const sunCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 0)
  const monCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 1)
  // Put 70 on Sunday week starting 2026-01-04 (Sun–Sat) — spans Mon tiling.
  const old: Record<string, number | ""> = {}
  for (const c of sunCols) old[c.weekKey] = ""
  old[sunCols[0]!.weekKey] = 70

  const next = rebucketWeeklyValues(old, sunCols, monCols)
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

test("rebucketRowsForWeekStartsOn materialises merged spans and conserves totals", () => {
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
  const next = rebucketRowsForWeekStartsOn(rows, sunCols, monCols)
  assert.equal(next[0]!.mergedWeekSpans?.length ?? 0, 0)
  const total = Object.values(next[0]!.weeklyValues).reduce<number>(
    (s, v) => s + (typeof v === "number" ? v : 0),
    0
  )
  assert.equal(total, 140)
})
