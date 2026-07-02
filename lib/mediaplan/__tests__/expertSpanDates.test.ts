import { test } from "node:test"
import assert from "node:assert/strict"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import { weekDayKeys } from "@/lib/mediaplan/expertDayModel"
import { DAY_COL_WIDTH_PX } from "@/lib/mediaplan/expertGridDayEntry"
import { WEEK_COL_WIDTH_PX } from "@/lib/mediaplan/expertGridShared"
import {
  deltaDaysFromPx,
  effectiveSpanYmdBounds,
  resizeSpanEdgeByDays,
  spanEdgeDayDeltaBounds,
  spanPartialCoveragePlan,
  weekKeyForYmd,
} from "@/lib/mediaplan/expertSpanDates"

const CS = new Date(2026, 0, 4)
const CE = new Date(2026, 0, 31)
const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)
const weekKeys = cols.map((c) => c.weekKey)
const dayKeysByWeekKey: Record<string, string[]> = {}
for (const col of cols) {
  dayKeysByWeekKey[col.weekKey] = weekDayKeys(col, CS, CE)
}

const span = {
  startWeekKey: weekKeys[1]!,
  endWeekKey: weekKeys[2]!,
  startYmd: dayKeysByWeekKey[weekKeys[1]!]![2]!,
  endYmd: dayKeysByWeekKey[weekKeys[2]!]![4]!,
}

test("effectiveSpanYmdBounds prefers overrides", () => {
  const bounds = effectiveSpanYmdBounds(span, cols, CS, CE)
  assert.ok(bounds)
  assert.equal(bounds!.startYmd, span.startYmd)
  assert.equal(bounds!.endYmd, span.endYmd)
})

test("weekKeyForYmd resolves campaign day to week", () => {
  const dk = dayKeysByWeekKey[weekKeys[0]!]![0]!
  assert.equal(weekKeyForYmd(dk, dayKeysByWeekKey), weekKeys[0])
})

test("spanEdgeDayDeltaBounds enforces min 1-day span and blocked week", () => {
  const weekBlocked = (k: string) => k === weekKeys[3]!
  const endBounds = spanEdgeDayDeltaBounds(
    span,
    "end",
    cols,
    CS,
    CE,
    dayKeysByWeekKey,
    weekBlocked
  )
  assert.ok(endBounds)
  const spanDays =
    Math.floor(
      (new Date(span.endYmd).getTime() - new Date(span.startYmd).getTime()) /
        86400000
    ) + 1
  assert.equal(endBounds!.minDelta, -(spanDays - 1))
  assert.ok(endBounds!.maxDelta >= 0)

  const startBounds = spanEdgeDayDeltaBounds(
    span,
    "start",
    cols,
    CS,
    CE,
    dayKeysByWeekKey,
    weekBlocked
  )
  assert.ok(startBounds)
  assert.equal(startBounds!.maxDelta, spanDays - 1)
})

test("resizeSpanEdgeByDays shifts end and recomputes week keys", () => {
  const bounds = spanEdgeDayDeltaBounds(
    span,
    "end",
    cols,
    CS,
    CE,
    dayKeysByWeekKey,
    () => false
  )!
  const resized = resizeSpanEdgeByDays(
    span,
    "end",
    1,
    cols,
    CS,
    CE,
    dayKeysByWeekKey,
    bounds
  )
  assert.ok(resized)
  assert.equal(
    resized!.endYmd,
    dayKeysByWeekKey[weekKeys[2]!]![
      dayKeysByWeekKey[weekKeys[2]!]!.indexOf(span.endYmd) + 1
    ]
  )
  assert.equal(resized!.startYmd, span.startYmd)
  assert.equal(resized!.startWeekKey, span.startWeekKey)
})

test("resizeSpanEdgeByDays refuses to cross the other edge", () => {
  const bounds = spanEdgeDayDeltaBounds(
    span,
    "end",
    cols,
    CS,
    CE,
    dayKeysByWeekKey,
    () => false
  )!
  const resized = resizeSpanEdgeByDays(
    span,
    "end",
    bounds.minDelta - 5,
    cols,
    CS,
    CE,
    dayKeysByWeekKey,
    bounds
  )
  assert.ok(resized)
  assert.equal(resized!.startYmd, resized!.endYmd)
})

test("deltaDaysFromPx steps per day in expanded weeks", () => {
  const expanded = new Set([weekKeys[1]!])
  const edgeYmd = span.startYmd
  const ctx = {
    weekKeys,
    expandedWeekKeys: expanded,
    dayKeysByWeekKey,
    weekColumnWidths: {} as Record<string, number>,
    defaultWeekColWidthPx: WEEK_COL_WIDTH_PX,
    dayColWidthPx: DAY_COL_WIDTH_PX,
  }
  assert.equal(deltaDaysFromPx(edgeYmd, DAY_COL_WIDTH_PX, ctx), 1)
  assert.equal(deltaDaysFromPx(edgeYmd, DAY_COL_WIDTH_PX * 2 + 1, ctx), 2)
})

test("spanPartialCoveragePlan splits leading, anchor, trailing in expanded edge weeks", () => {
  const expanded = new Set([span.startWeekKey, span.endWeekKey])
  const plan = spanPartialCoveragePlan(
    span,
    cols,
    CS,
    CE,
    expanded,
    dayKeysByWeekKey
  )
  assert.ok(plan)
  const startDays = dayKeysByWeekKey[span.startWeekKey]!
  const endDays = dayKeysByWeekKey[span.endWeekKey]!
  assert.deepEqual(plan!.leadingDayKeys, startDays.filter((d) => d < span.startYmd))
  assert.deepEqual(plan!.trailingDayKeys, endDays.filter((d) => d > span.endYmd))
  const coveredStart = startDays.filter((d) => d >= span.startYmd).length
  const coveredEnd = endDays.filter((d) => d <= span.endYmd).length
  assert.equal(plan!.anchorColUnits, coveredStart + coveredEnd)
})
