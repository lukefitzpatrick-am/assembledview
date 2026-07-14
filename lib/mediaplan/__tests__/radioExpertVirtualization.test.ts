/**
 * F-28 Phase 2 — Radio Expert row virtualization smoke (Prompt A items 1,3,5,7,8).
 */
import assert from "node:assert/strict"
import test from "node:test"
import { format, startOfDay } from "date-fns"

import { mapRadioExpertRowsToStandardLineItems } from "@/lib/mediaplan/expertChannelMappings"
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
  ExpertWeeklyValues,
  RadioExpertScheduleRow,
} from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  OOH_EXPERT_ROW_HEIGHT_PX,
  OOH_EXPERT_ROW_OVERSCAN,
  expectedMountedRowRange,
  mountedRowCount,
  virtualRowIndexFromOffsetY,
} from "@/lib/mediaplan/oohExpertVirtualization"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

const RADIO_EXPERT_ROW_HEIGHT_PX = OOH_EXPERT_ROW_HEIGHT_PX
const RADIO_EXPERT_ROW_OVERSCAN = OOH_EXPERT_ROW_OVERSCAN

const CS = new Date(2026, 0, 1)
const CE = new Date(2026, 11, 31)
const weekColumns = buildWeeklyGanttColumnsFromCampaign(CS, CE)
const weekKeys = weekColumns.map((c) => c.weekKey)

function emptyRow(id: string): RadioExpertScheduleRow {
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weeklyValues = {} as ExpertWeeklyValues
  for (const k of weekKeys) weeklyValues[k] = ""
  return {
    id,
    startDate: ymd(CS),
    endDate: ymd(CE),
    network: "",
    station: "",
    market: "",
    placement: "",
    duration: "",
    format: "",
    buyingDemo: "",
    buyType: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: "",
    grossCost: 0,
    weeklyValues,
    mergedWeekSpans: [],
  }
}

function buildRows(n: number): RadioExpertScheduleRow[] {
  return Array.from({ length: n }, (_, i) => emptyRow(`radio-v-${i}`))
}

/** Mirrors RadioExpertGrid containerTotals over the FULL logical array. */
function computeRadioWeeklyTotals(
  rows: readonly RadioExpertScheduleRow[],
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
    placement: "OFF-WINDOW-PLACEMENT-MARK",
    network: "OFF-WINDOW-NETWORK",
    buyType: "spots",
    unitRate: 100,
    weeklyValues: {
      ...rows[offWindowIndex]!.weeklyValues,
      [weekKeys[0]!]: 7,
    },
  })
  assert.ok(patched)
  rows = patched!

  const standard = mapRadioExpertRowsToStandardLineItems(
    rows,
    weekColumns,
    CS,
    CE,
    { feePctRadio: 0 }
  )

  assert.equal(standard.length, 300, "Apply must emit all 300 logical rows")
  assert.equal(standard[offWindowIndex]!.placement, "OFF-WINDOW-PLACEMENT-MARK")
  assert.equal(standard[offWindowIndex]!.network, "OFF-WINDOW-NETWORK")
  assert.equal(standard[0]!.placement, "")
  assert.notEqual(standard[0]!.placement, "OFF-WINDOW-PLACEMENT-MARK")
})

test("3. DRAG REORDER across virtual boundary lands on correct logical index", () => {
  const rows = buildRows(300).map((r, i) => ({
    ...r,
    placement: `P${i}`,
  }))
  const dropIndex = virtualRowIndexFromOffsetY(
    280 * RADIO_EXPERT_ROW_HEIGHT_PX + 1,
    RADIO_EXPERT_ROW_HEIGHT_PX,
    300
  )
  assert.equal(dropIndex, 280)

  const next = reorderExpertRows(rows, 2, dropIndex)
  assert.ok(next)
  assert.equal(next![280]!.placement, "P2")
  assert.equal(next![2]!.placement, "P3")

  const standard = mapRadioExpertRowsToStandardLineItems(
    next!,
    weekColumns,
    CS,
    CE,
    { feePctRadio: 0 }
  )
  assert.equal(standard[280]!.placement, "P2")
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
  assert.equal(RADIO_EXPERT_ROW_HEIGHT_PX, 41)
})

test("7. WEEKLY TOTALS derived from full 300-row state", () => {
  const rows = buildRows(300).map((r, i) => ({
    ...r,
    buyType: "spots",
    unitRate: 10,
    weeklyValues: {
      ...r.weeklyValues,
      [weekKeys[0]!]: i === 0 || i === 299 ? 5 : ("" as const),
    },
  }))
  const totals = computeRadioWeeklyTotals(rows, 0)
  assert.equal(totals.sumQty, 10)
  assert.equal(totals.perWeek[weekKeys[0]!], 10)

  const edited = updateRowAtIndex(rows, 150, {
    weeklyValues: {
      ...rows[150]!.weeklyValues,
      [weekKeys[0]!]: 100,
    },
  })!
  const after = computeRadioWeeklyTotals(edited, 0)
  assert.equal(after.sumQty, 110)
  assert.equal(after.perWeek[weekKeys[0]!], 110)
})

test("8. PERF: mounted DOM window stays bounded while scrolling 300 rows", () => {
  const viewportHeight = 400
  const rowCount = 300
  const nearTop = expectedMountedRowRange(
    0,
    viewportHeight,
    RADIO_EXPERT_ROW_HEIGHT_PX,
    rowCount,
    RADIO_EXPERT_ROW_OVERSCAN
  )
  const mid = expectedMountedRowRange(
    150 * RADIO_EXPERT_ROW_HEIGHT_PX,
    viewportHeight,
    RADIO_EXPERT_ROW_HEIGHT_PX,
    rowCount,
    RADIO_EXPERT_ROW_OVERSCAN
  )
  const nearBottom = expectedMountedRowRange(
    280 * RADIO_EXPERT_ROW_HEIGHT_PX,
    viewportHeight,
    RADIO_EXPERT_ROW_HEIGHT_PX,
    rowCount,
    RADIO_EXPERT_ROW_OVERSCAN
  )

  const maxWindow =
    Math.ceil(viewportHeight / RADIO_EXPERT_ROW_HEIGHT_PX) +
    2 * RADIO_EXPERT_ROW_OVERSCAN +
    2
  assert.ok(mountedRowCount(nearTop) <= maxWindow)
  assert.ok(mountedRowCount(mid) <= maxWindow)
  assert.ok(mountedRowCount(nearBottom) <= maxWindow)
  assert.ok(mountedRowCount(mid) < 80)
})
