import { test } from "node:test"
import assert from "node:assert/strict"
import { format } from "date-fns"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import { weekDayKeys } from "@/lib/mediaplan/expertDayModel"
import { clearConflictingDayDetail, DAY_COL_WIDTH_PX } from "@/lib/mediaplan/expertGridDayEntry"
import { WEEK_COL_WIDTH_PX } from "@/lib/mediaplan/expertGridShared"
import {
  deltaDaysFromPx,
  deriveExpertRowScheduleYmdFromRow,
  effectiveSpanYmdBounds,
  resizeSpanEdgeByDays,
  setExpertRowEdgeDate,
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

function pushRowLike(
  row: Parameters<typeof setExpertRowEdgeDate>[0],
  edge: "start" | "end",
  ymd: string
) {
  const result = setExpertRowEdgeDate(
    row,
    edge,
    ymd,
    cols,
    CS,
    CE,
    dayKeysByWeekKey
  )
  assert.ok(!("error" in result))
  const cleared = clearConflictingDayDetail(
    result,
    dayKeysByWeekKey,
    weekKeys
  )
  return deriveExpertRowScheduleYmdFromRow(
    cleared,
    cols,
    CS,
    CE,
    dayKeysByWeekKey
  )
}

test("setExpertRowEdgeDate moves span start and derived date matches pick", () => {
  const row = {
    weeklyValues: Object.fromEntries(weekKeys.map((k) => [k, ""])) as Record<
      string,
      number | ""
    >,
    mergedWeekSpans: [
      {
        id: "s1",
        startWeekKey: weekKeys[1]!,
        endWeekKey: weekKeys[2]!,
        totalQty: 100,
        startYmd: span.startYmd,
        endYmd: span.endYmd,
      },
    ],
  }
  const picked = dayKeysByWeekKey[weekKeys[1]!]![0]!
  const result = setExpertRowEdgeDate(
    row,
    "start",
    picked,
    cols,
    CS,
    CE,
    dayKeysByWeekKey
  )
  assert.ok(!("error" in result))
  const spanOut = result.mergedWeekSpans![0]!
  assert.equal(spanOut.startYmd, picked)
  assert.equal(spanOut.totalQty, 100)
  const derived = pushRowLike(row, "start", picked)
  assert.equal(derived.startDate, picked)
})

test("setExpertRowEdgeDate converts week cell to span with mid-week trim", () => {
  const wk = weekKeys[2]!
  const days = dayKeysByWeekKey[wk]!
  const row = {
    weeklyValues: Object.fromEntries(
      weekKeys.map((k) => [k, k === wk ? 42 : ""])
    ) as Record<string, number | "">,
  }
  const pickedStart = days[1]!
  const result = setExpertRowEdgeDate(
    row,
    "start",
    pickedStart,
    cols,
    CS,
    CE,
    dayKeysByWeekKey
  )
  assert.ok(!("error" in result))
  assert.equal(result.weeklyValues[wk], "")
  const spanOut = result.mergedWeekSpans![0]!
  assert.equal(spanOut.startWeekKey, wk)
  assert.equal(spanOut.endWeekKey, wk)
  assert.equal(spanOut.startYmd, pickedStart)
  assert.equal(spanOut.endYmd, days[days.length - 1])
  assert.equal(spanOut.totalQty, 42)
  const derived = deriveExpertRowScheduleYmdFromRow(
    clearConflictingDayDetail(result, dayKeysByWeekKey, weekKeys),
    cols,
    CS,
    CE,
    dayKeysByWeekKey
  )
  assert.equal(derived.startDate, pickedStart)
})

test("setExpertRowEdgeDate extends week cell start into earlier empty weeks", () => {
  const wk = weekKeys[2]!
  const earlier = weekKeys[0]!
  const row = {
    weeklyValues: Object.fromEntries(
      weekKeys.map((k) => [k, k === wk ? 10 : ""])
    ) as Record<string, number | "">,
  }
  const picked = dayKeysByWeekKey[earlier]![0]!
  const result = setExpertRowEdgeDate(
    row,
    "start",
    picked,
    cols,
    CS,
    CE,
    dayKeysByWeekKey
  )
  assert.ok(!("error" in result))
  const spanOut = result.mergedWeekSpans![0]!
  assert.equal(spanOut.startWeekKey, earlier)
  assert.equal(spanOut.endWeekKey, wk)
  assert.equal(spanOut.startYmd, picked)
  assert.equal(result.weeklyValues[wk], "")
})

test("setExpertRowEdgeDate clamps to campaign start", () => {
  const wk = weekKeys[2]!
  const row = {
    weeklyValues: Object.fromEntries(
      weekKeys.map((k) => [k, k === wk ? 12 : ""])
    ) as Record<string, number | "">,
  }
  const result = setExpertRowEdgeDate(
    row,
    "start",
    "2020-01-01",
    cols,
    CS,
    CE,
    dayKeysByWeekKey
  )
  assert.ok(!("error" in result))
  const spanOut = result.mergedWeekSpans![0]!
  assert.equal(spanOut.startYmd, format(CS, "yyyy-MM-dd"))
})

test("setExpertRowEdgeDate end cannot cross row start (min 1 day)", () => {
  const wk = weekKeys[1]!
  const days = dayKeysByWeekKey[wk]!
  const row = {
    weeklyValues: Object.fromEntries(
      weekKeys.map((k) => [k, k === wk ? 6 : ""])
    ) as Record<string, number | "">,
  }
  const result = setExpertRowEdgeDate(
    row,
    "end",
    days[0]!,
    cols,
    CS,
    CE,
    dayKeysByWeekKey
  )
  assert.ok(!("error" in result))
  const spanOut = result.mergedWeekSpans![0]!
  assert.equal(spanOut.startYmd, spanOut.endYmd)
})

test("setExpertRowEdgeDate refuses empty row", () => {
  const row = {
    weeklyValues: Object.fromEntries(weekKeys.map((k) => [k, ""])) as Record<
      string,
      number | ""
    >,
  }
  const result = setExpertRowEdgeDate(
    row,
    "start",
    dayKeysByWeekKey[weekKeys[0]!]![0]!,
    cols,
    CS,
    CE,
    dayKeysByWeekKey
  )
  assert.ok("error" in result)
  assert.equal(result.error, "schedule a quantity first")
})

test("setExpertRowEdgeDate end pick matches derived end date", () => {
  const wk = weekKeys[2]!
  const days = dayKeysByWeekKey[wk]!
  const row = {
    weeklyValues: Object.fromEntries(
      weekKeys.map((k) => [k, k === wk ? 15 : ""])
    ) as Record<string, number | "">,
  }
  const pickedEnd = days[days.length - 2]!
  const derived = pushRowLike(row, "end", pickedEnd)
  assert.equal(derived.endDate, pickedEnd)
})
