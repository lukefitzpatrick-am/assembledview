import assert from "node:assert/strict"
import test from "node:test"
import { addDays, format } from "date-fns"
import {
  buildWeeklyGanttColumnsFromCampaign,
  clampDateToCampaignRange,
  getSaturdayOnOrAfter,
  getSundayOnOrBefore,
} from "../../lib/utils/weeklyGanttColumns.js"

test("getSundayOnOrBefore returns same Sunday for a Sunday", () => {
  const sun = new Date(2025, 9, 19)
  assert.equal(sun.getDay(), 0)
  const out = getSundayOnOrBefore(sun)
  assert.equal(out.getTime(), startOfLocalDay(sun).getTime())
})

test("getSundayOnOrBefore steps back to previous Sunday from mid-week", () => {
  const wed = new Date(2024, 9, 23)
  assert.equal(wed.getDay(), 3)
  const sun = getSundayOnOrBefore(wed)
  assert.equal(sun.getDay(), 0)
  const deltaDays = Math.round((startOfLocalDay(wed).getTime() - sun.getTime()) / 86400000)
  assert.equal(deltaDays, 3)
})

test("getSaturdayOnOrAfter is on Saturday local calendar", () => {
  const wed = new Date(2024, 9, 23)
  const satEnd = getSaturdayOnOrAfter(wed)
  assert.equal(satEnd.getDay(), 6)
  const satStart = startOfLocalDay(satEnd)
  const expected = startOfLocalDay(addDays(getSundayOnOrBefore(wed), 6))
  assert.equal(satStart.getTime(), expected.getTime())
})

test("buildWeeklyGanttColumnsFromCampaign covers partial weeks Sun–Sat", () => {
  const start = new Date(2024, 9, 23)
  const end = new Date(2024, 9, 29)
  const cols = buildWeeklyGanttColumnsFromCampaign(start, end)
  assert.equal(cols.length, 2)
  assert.equal(cols[0].weekKey, format(getSundayOnOrBefore(start), "yyyy-MM-dd"))
  assert.equal(cols[1].weekKey, format(addDays(getSundayOnOrBefore(start), 7), "yyyy-MM-dd"))
  assert.match(cols[0].labelFull, / - /)
})

test("buildWeeklyGanttColumnsFromCampaign default weekStartsOn=0 matches pre-param Sunday output byte-for-byte", () => {
  const start = new Date(2025, 2, 12) // Wed
  const end = new Date(2025, 3, 8) // Tue
  const withDefault = buildWeeklyGanttColumnsFromCampaign(start, end)
  const withExplicitSunday = buildWeeklyGanttColumnsFromCampaign(start, end, 0)
  assert.deepEqual(withDefault, withExplicitSunday)
  // Stable week-key sequence for the historic Sunday tiling.
  assert.deepEqual(
    withDefault.map((c) => c.weekKey),
    ["2025-03-09", "2025-03-16", "2025-03-23", "2025-03-30", "2025-04-06"]
  )
  assert.equal(withDefault[0]!.weekStart.getDay(), 0)
  assert.equal(withDefault[0]!.weekEnd.getDay(), 6)
})

test("buildWeeklyGanttColumnsFromCampaign respects each weekStartsOn", () => {
  const start = new Date(2025, 2, 12)
  const end = new Date(2025, 2, 20)
  for (let d = 0; d <= 6; d++) {
    const cols = buildWeeklyGanttColumnsFromCampaign(
      start,
      end,
      d as 0 | 1 | 2 | 3 | 4 | 5 | 6
    )
    assert.ok(cols.length >= 1)
    assert.equal(cols[0]!.weekStart.getDay(), d)
    for (const col of cols) {
      assert.equal(col.weekStart.getDay(), d)
      assert.equal(col.weekKey, format(col.weekStart, "yyyy-MM-dd"))
    }
  }
  const monday = buildWeeklyGanttColumnsFromCampaign(start, end, 1)
  assert.equal(monday[0]!.weekKey, "2025-03-10")
})

test("buildWeeklyGanttColumnsFromCampaign returns [] when end is before start", () => {
  assert.deepEqual(
    buildWeeklyGanttColumnsFromCampaign(new Date(2025, 5, 10), new Date(2025, 5, 1)),
    []
  )
})

test("clampDateToCampaignRange uses inclusive local calendar days", () => {
  const campaignStart = new Date(2025, 5, 10)
  const campaignEnd = new Date(2025, 5, 20)
  assert.equal(
    clampDateToCampaignRange(new Date(2025, 5, 1), campaignStart, campaignEnd).getTime(),
    startOfLocalDay(campaignStart).getTime()
  )
  assert.equal(
    clampDateToCampaignRange(new Date(2025, 5, 30), campaignStart, campaignEnd).getTime(),
    startOfLocalDay(campaignEnd).getTime()
  )
  const mid = new Date(2025, 5, 15, 14, 30, 0)
  assert.equal(
    clampDateToCampaignRange(mid, campaignStart, campaignEnd).getTime(),
    startOfLocalDay(mid).getTime()
  )
})

function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
