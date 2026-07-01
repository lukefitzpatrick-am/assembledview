import { test } from "node:test"
import assert from "node:assert/strict"
import {
  buildDayColumnsForWeek,
  expandWeekToDaily,
  collapseDailyToWeekly,
  weekIsUniform,
  emitDayBurstsForWeek,
  resizeSpanWeeks,
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
