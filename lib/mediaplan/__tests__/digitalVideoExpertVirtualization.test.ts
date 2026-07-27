/**
 * F-28 Phase 2 — Digital Video Expert row virtualization smoke (Prompt A items 1,3,5,7,8).
 */
import assert from "node:assert/strict"
import test from "node:test"
import { format, startOfDay } from "date-fns"

import { mapDigiVideoExpertRowsToStandardLineItems } from "@/lib/mediaplan/expertChannelMappings"
import {
  reorderExpertRows,
  mergedSpanWidthPx,
} from "@/lib/mediaplan/expertGridInteractions"
import {
  updateRowAtIndex,
} from "@/lib/mediaplan/expertGridRowPerf"
import { expertGridParseNum, WEEK_COL_WIDTH_PX } from "@/lib/mediaplan/expertGridShared"
import { expertRowCostSplit } from "@/lib/mediaplan/expertRowCost"
import type {
  DigiVideoExpertScheduleRow,
  ExpertWeeklyValues,
} from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  OOH_EXPERT_ROW_HEIGHT_PX,
  EXPERT_GRID_ROW_OVERSCAN_DEFAULT,
  expectedMountedRowRange,
  mountedRowCount,
  virtualRowIndexFromOffsetY,
} from "@/lib/mediaplan/oohExpertVirtualization"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

const DIGIVIDEO_EXPERT_ROW_HEIGHT_PX = OOH_EXPERT_ROW_HEIGHT_PX
const DIGIVIDEO_EXPERT_ROW_OVERSCAN = EXPERT_GRID_ROW_OVERSCAN_DEFAULT

const CS = new Date(2026, 0, 1)
const CE = new Date(2026, 11, 31)
const weekColumns = buildWeeklyGanttColumnsFromCampaign(CS, CE)
const weekKeys = weekColumns.map((c) => c.weekKey)

function emptyRow(id: string): DigiVideoExpertScheduleRow {
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weeklyValues = {} as ExpertWeeklyValues
  for (const k of weekKeys) weeklyValues[k] = ""
  return {
    id,
    startDate: ymd(CS),
    endDate: ymd(CE),
    platform: "",
    publisher: "",
    site: "",
    bidStrategy: "",
    buyType: "",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    noadserving: false,
    unitRate: "",
    grossCost: 0,
    weeklyValues,
    mergedWeekSpans: [],
  }
}

function buildRows(n: number): DigiVideoExpertScheduleRow[] {
  return Array.from({ length: n }, (_, i) => emptyRow(`digivideo-v-${i}`))
}

/** Mirrors DigitalVideoExpertGrid containerTotals over the FULL logical array. */
function computeDigiVideoWeeklyTotals(
  rows: readonly DigiVideoExpertScheduleRow[],
  feePct: number
) {
  let sumNet = 0
  let sumFee = 0
  let sumQty = 0
  const perWeek: Record<string, number> = {}
  for (const k of weekKeys) perWeek[k] = 0

  for (const row of rows) {
    const { net, fee } = expertRowCostSplit(row, weekKeys, feePct)
    sumNet += net
    sumFee += fee
    for (const k of weekKeys) {
      const q = expertGridParseNum(row.weeklyValues[k])
      perWeek[k] += q
      sumQty += q
    }
    for (const span of row.mergedWeekSpans ?? []) {
      const q = span.totalQty
      if (!Number.isFinite(q) || q === 0) continue
      if (span.startWeekKey in perWeek) {
        perWeek[span.startWeekKey] += q
      }
      sumQty += q
    }
  }

  return { sumNet, sumQty, perWeek, fee: sumFee, totalWithFee: sumNet + sumFee }
}

test("1. APPLY CORRECTNESS: edit on off-window row survives Apply (full state, not DOM)", () => {
  let rows = buildRows(300)
  const offWindowIndex = 250
  const patched = updateRowAtIndex(rows, offWindowIndex, {
    site: "OFF-WINDOW-SITE-MARK",
    publisher: "OFF-WINDOW-PUBLISHER",
    buyType: "cpm",
    unitRate: 100,
    weeklyValues: {
      ...rows[offWindowIndex]!.weeklyValues,
      [weekKeys[0]!]: 7,
    },
  })
  assert.ok(patched)
  rows = patched!

  const standard = mapDigiVideoExpertRowsToStandardLineItems(
    rows,
    weekColumns,
    CS,
    CE,
    { feePctDigiVideo: 0 }
  )

  assert.equal(standard.length, 300, "Apply must emit all 300 logical rows")
  assert.equal(standard[offWindowIndex]!.site, "OFF-WINDOW-SITE-MARK")
  assert.equal(standard[offWindowIndex]!.publisher, "OFF-WINDOW-PUBLISHER")
  assert.equal(standard[0]!.site, "")
  assert.notEqual(standard[0]!.site, "OFF-WINDOW-SITE-MARK")
})

test("3. DRAG REORDER across virtual boundary lands on correct logical index", () => {
  const rows = buildRows(300).map((r, i) => ({
    ...r,
    site: `P${i}`,
  }))
  const dropIndex = virtualRowIndexFromOffsetY(
    280 * DIGIVIDEO_EXPERT_ROW_HEIGHT_PX + 1,
    DIGIVIDEO_EXPERT_ROW_HEIGHT_PX,
    300
  )
  assert.equal(dropIndex, 280)

  const next = reorderExpertRows(rows, 2, dropIndex)
  assert.ok(next)
  assert.equal(next![280]!.site, "P2")
  assert.equal(next![2]!.site, "P3")

  const standard = mapDigiVideoExpertRowsToStandardLineItems(
    next!,
    weekColumns,
    CS,
    CE,
    { feePctDigiVideo: 0 }
  )
  assert.equal(standard[280]!.site, "P2")
  assert.equal(Number(standard[280]!.line_item ?? standard[280]!.lineItem), 281)
  assert.equal(Number(standard[0]!.line_item ?? standard[0]!.lineItem), 1)
})

test("5. WEEK-COLUMN WIDTH respects resize overrides (sticky header/week resize path)", () => {
  const start = weekKeys[0]!
  const end = weekKeys[2]!
  const widths = { [weekKeys[1]!]: 200 }
  assert.equal(
    mergedSpanWidthPx(weekKeys, start, end, widths),
    WEEK_COL_WIDTH_PX + 200 + WEEK_COL_WIDTH_PX
  )
  assert.equal(DIGIVIDEO_EXPERT_ROW_HEIGHT_PX, 41)
})

test("7. WEEKLY TOTALS derived from full 300-row state", () => {
  const rows = buildRows(300).map((r, i) => ({
    ...r,
    buyType: "cpm",
    unitRate: 10,
    weeklyValues: {
      ...r.weeklyValues,
      [weekKeys[0]!]: i === 0 || i === 299 ? 5 : ("" as const),
    },
  }))
  const totals = computeDigiVideoWeeklyTotals(rows, 0)
  assert.equal(totals.sumQty, 10)
  assert.equal(totals.perWeek[weekKeys[0]!], 10)

  const edited = updateRowAtIndex(rows, 150, {
    weeklyValues: {
      ...rows[150]!.weeklyValues,
      [weekKeys[0]!]: 100,
    },
  })!
  const after = computeDigiVideoWeeklyTotals(edited, 0)
  assert.equal(after.sumQty, 110)
  assert.equal(after.perWeek[weekKeys[0]!], 110)
})

test("8. PERF: mounted DOM window stays bounded while scrolling 300 rows", () => {
  const viewportHeight = 400
  const rowCount = 300
  const nearTop = expectedMountedRowRange(
    0,
    viewportHeight,
    DIGIVIDEO_EXPERT_ROW_HEIGHT_PX,
    rowCount,
    DIGIVIDEO_EXPERT_ROW_OVERSCAN
  )
  const mid = expectedMountedRowRange(
    150 * DIGIVIDEO_EXPERT_ROW_HEIGHT_PX,
    viewportHeight,
    DIGIVIDEO_EXPERT_ROW_HEIGHT_PX,
    rowCount,
    DIGIVIDEO_EXPERT_ROW_OVERSCAN
  )
  const nearBottom = expectedMountedRowRange(
    280 * DIGIVIDEO_EXPERT_ROW_HEIGHT_PX,
    viewportHeight,
    DIGIVIDEO_EXPERT_ROW_HEIGHT_PX,
    rowCount,
    DIGIVIDEO_EXPERT_ROW_OVERSCAN
  )

  const maxWindow =
    Math.ceil(viewportHeight / DIGIVIDEO_EXPERT_ROW_HEIGHT_PX) +
    2 * DIGIVIDEO_EXPERT_ROW_OVERSCAN +
    2
  assert.ok(mountedRowCount(nearTop) <= maxWindow)
  assert.ok(mountedRowCount(mid) <= maxWindow)
  assert.ok(mountedRowCount(nearBottom) <= maxWindow)
  assert.ok(mountedRowCount(mid) < 80)
})
