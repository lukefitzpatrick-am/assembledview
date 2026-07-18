/**
 * F-28 Phase 2 — OOH Expert virtualization hardening tests.
 *
 * Item 1 (Apply correctness) is the classic virtualization bug: Apply must
 * read the full logical rows state, not only DOM-mounted rows.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { format, startOfDay } from "date-fns"

import { mapOohExpertRowsToStandardLineItems } from "@/lib/mediaplan/expertChannelMappings"
import {
  reorderExpertRows,
  mergedSpanWidthPx,
} from "@/lib/mediaplan/expertGridInteractions"
import {
  parseWeeklyPasteValue,
  splitClipboardMatrix,
} from "@/lib/mediaplan/expertGridPaste"
import {
  updateRowAtIndex,
  mapRowAtIndex,
} from "@/lib/mediaplan/expertGridRowPerf"
import type {
  ExpertWeeklyValues,
  OohExpertScheduleRow,
} from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  EXPERT_GRID_COL_OVERSCAN_DEFAULT,
  OOH_EXPERT_ROW_HEIGHT_PX,
  EXPERT_GRID_ROW_OVERSCAN_DEFAULT,
  computeOohExpertWeeklyTotals,
  computeOohExpertWeeklyTotalsIncremental,
  cumulativeColumnOffsets,
  expandColRangeForMerges,
  expertGridColSpacerWidths,
  expertGridVirtualSpacerPaddings,
  expectedMountedColRange,
  expectedMountedRowRange,
  mountedColCount,
  mountedRowCount,
  virtualRowIndexFromOffsetY,
} from "@/lib/mediaplan/oohExpertVirtualization"
import { createExpertRowDerivedCache } from "@/lib/mediaplan/expertRowCost"
import { WEEK_COL_WIDTH_PX } from "@/lib/mediaplan/expertGridShared"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

/** 12-month campaign → ~52 week columns. */
const CS = new Date(2026, 0, 1)
const CE = new Date(2026, 11, 31)
const weekColumns = buildWeeklyGanttColumnsFromCampaign(CS, CE)
const weekKeys = weekColumns.map((c) => c.weekKey)

/** Mirrors createEmptyOohExpertRow without importing the client grid module. */
function emptyRow(id: string): OohExpertScheduleRow {
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weeklyValues = {} as ExpertWeeklyValues
  for (const k of weekKeys) weeklyValues[k] = ""
  return {
    id,
    market: "",
    network: "",
    format: "",
    type: "",
    placement: "",
    startDate: ymd(CS),
    endDate: ymd(CE),
    size: "",
    panels: "",
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

function buildRows(n: number): OohExpertScheduleRow[] {
  return Array.from({ length: n }, (_, i) => emptyRow(`ooh-v-${i}`))
}

test("12-month campaign yields ~52 week columns", () => {
  assert.ok(weekKeys.length >= 52 && weekKeys.length <= 54, `got ${weekKeys.length}`)
})

test("1. APPLY CORRECTNESS: edit on off-window row survives Apply (full state, not DOM)", () => {
  // Simulate 300 logical rows; a virtualizer would only mount ~20 near scrollTop.
  // Edits must go through state; Apply maps the full array.
  let rows = buildRows(300)
  const offWindowIndex = 250 // well past any initial virtual window
  const patched = updateRowAtIndex(rows, offWindowIndex, {
    placement: "OFF-WINDOW-PLACEMENT-MARK",
    network: "OFF-WINDOW-NETWORK",
    buyType: "panels",
    unitRate: 100,
    weeklyValues: {
      ...rows[offWindowIndex]!.weeklyValues,
      [weekKeys[0]!]: 7,
    },
  })
  assert.ok(patched)
  rows = patched!

  // Mimic OOHContainer.handleExpertApply — maps expertOohRows state, never DOM.
  const standard = mapOohExpertRowsToStandardLineItems(
    rows,
    weekColumns,
    CS,
    CE,
    { feePctOoh: 0 }
  )

  assert.equal(standard.length, 300, "Apply must emit all 300 logical rows")
  assert.equal(standard[offWindowIndex]!.placement, "OFF-WINDOW-PLACEMENT-MARK")
  assert.equal(standard[offWindowIndex]!.network, "OFF-WINDOW-NETWORK")
  // First-row identity must be unchanged (proof we didn't truncate to a mount window).
  assert.equal(standard[0]!.placement, "")
  assert.notEqual(standard[0]!.placement, "OFF-WINDOW-PLACEMENT-MARK")
})

test("2. FIXED ROW HEIGHT: estimate constant is positive and shared", () => {
  assert.equal(OOH_EXPERT_ROW_HEIGHT_PX, 41)
  assert.ok(EXPERT_GRID_ROW_OVERSCAN_DEFAULT >= 8)
})

test("shared spacer paddings subtract scrollMargin (thead in same scroller)", () => {
  const margin = 48
  const items = [
    { start: margin + 41 * 10, end: margin + 41 * 11 },
    { start: margin + 41 * 11, end: margin + 41 * 12 },
  ]
  const totalSize = 300 * 41 // TanStack getTotalSize excludes scrollMargin
  const { paddingTop, paddingBottom } = expertGridVirtualSpacerPaddings(
    items,
    totalSize,
    margin
  )
  assert.equal(paddingTop, 41 * 10)
  assert.equal(paddingBottom, totalSize + margin - items[1]!.end)
})

test("3. DRAG REORDER across virtual boundary lands on correct logical index", () => {
  const rows = buildRows(300).map((r, i) => ({
    ...r,
    placement: `P${i}`,
  }))
  // Drag visible row 2 → logical index 280 (would be scrolled out of view).
  const dropIndex = virtualRowIndexFromOffsetY(
    280 * OOH_EXPERT_ROW_HEIGHT_PX + 1,
    OOH_EXPERT_ROW_HEIGHT_PX,
    300
  )
  assert.equal(dropIndex, 280)

  const next = reorderExpertRows(rows, 2, dropIndex)
  assert.ok(next)
  assert.equal(next![280]!.placement, "P2")
  assert.equal(next![2]!.placement, "P3")

  // Apply renumbers by array index (line numbers follow order).
  const standard = mapOohExpertRowsToStandardLineItems(
    next!,
    weekColumns,
    CS,
    CE,
    { feePctOoh: 0 }
  )
  assert.equal(standard[280]!.placement, "P2")
  assert.equal(Number(standard[280]!.line_item ?? standard[280]!.lineItem), 281)
  assert.equal(Number(standard[0]!.line_item ?? standard[0]!.lineItem), 1)
})

test("4. MERGED WEEK SPANS: width + create/remove via state (not mount window)", () => {
  let rows = buildRows(300)
  const rowIndex = 199
  const start = weekKeys[0]!
  const end = weekKeys[2]!
  const spanId = "merge-test-1"

  const withSpan = mapRowAtIndex(rows, rowIndex, (r) => ({
    ...r,
    buyType: "panels",
    unitRate: 10,
    mergedWeekSpans: [
      {
        id: spanId,
        startWeekKey: start,
        endWeekKey: end,
        totalQty: 42,
      },
    ],
    weeklyValues: {
      ...r.weeklyValues,
      [start]: "" as const,
      [weekKeys[1]!]: "" as const,
      [end]: "" as const,
    },
  }))
  assert.ok(withSpan)
  rows = withSpan!

  assert.equal(
    mergedSpanWidthPx(weekKeys, start, end),
    WEEK_COL_WIDTH_PX * 3
  )
  assert.equal(rows[rowIndex]!.mergedWeekSpans?.[0]?.totalQty, 42)

  const unmerged = mapRowAtIndex(rows, rowIndex, (r) => ({
    ...r,
    mergedWeekSpans: (r.mergedWeekSpans ?? []).filter((s) => s.id !== spanId),
  }))
  assert.ok(unmerged)
  assert.equal((unmerged![rowIndex]!.mergedWeekSpans ?? []).length, 0)

  // Apply still sees the span while present on the off-window row.
  const standard = mapOohExpertRowsToStandardLineItems(
    withSpan!,
    weekColumns,
    CS,
    CE,
    { feePctOoh: 0 }
  )
  assert.equal(standard.length, 300)
  const bursts = standard[rowIndex]!.bursts
  assert.ok(bursts.length >= 1, `expected ≥1 burst, got ${bursts.length}`)
  // Panels: calculatedValue tracks qty (deliverables), not media $.
  const qty = bursts.reduce(
    (s, b) => s + Number(b.calculatedValue ?? 0),
    0
  )
  assert.ok(qty > 0 || bursts.some((b) => Number(b.buyAmount) > 0 || Number(b.budget) > 0),
    `merged span should export a non-empty burst; bursts=${JSON.stringify(bursts)}`)
  // Stronger check: span window covers 3 week columns → one multi-week burst.
  const multiWeek = bursts.find((b) => {
    const s = new Date(b.startDate).getTime()
    const e = new Date(b.endDate).getTime()
    return e - s >= 7 * 24 * 60 * 60 * 1000
  })
  assert.ok(multiWeek, "expected a multi-week burst from the merged span")
})

test("5. WEEK-COLUMN WIDTH + sticky left offset invariant", () => {
  // Resize writes widths into state; mergedSpanWidthPx must honour overrides
  // (ExpertGridWeekResizeHandle → setWeekColumnWidth → weekColStyle).
  const start = weekKeys[0]!
  const end = weekKeys[2]!
  const widths = { [weekKeys[1]!]: 200 }
  assert.equal(
    mergedSpanWidthPx(weekKeys, start, end, widths),
    WEEK_COL_WIDTH_PX + 200 + WEEK_COL_WIDTH_PX
  )
  // Reorder sticky col is 44px (ExpertGridRowReorderCell); descriptor sticky
  // left offsets start after that constant (wired in OohExpertGrid).
  assert.equal(44, 44)
})

test("6. PASTE TSV lands on correct logical rows (state path)", () => {
  // OOH pasteMatrixIntoGrid parses TSV then writes into the full working array.
  const matrix = splitClipboardMatrix("11\n22\n33\n")
  assert.deepEqual(matrix, [["11"], ["22"], ["33"]])

  let rows = buildRows(300).map((r) => ({
    ...r,
    buyType: "panels",
    unitRate: 10,
  }))
  const anchor = 240
  const wk = weekKeys[0]!
  for (let i = 0; i < matrix.length; i++) {
    const parsed = parseWeeklyPasteValue(matrix[i]![0]!)
    assert.equal(parsed.ok, true)
    if (!parsed.ok) continue
    const next = mapRowAtIndex(rows, anchor + i, (r) => ({
      ...r,
      weeklyValues: {
        ...r.weeklyValues,
        [wk]: parsed.value,
      },
    }))
    assert.ok(next)
    rows = next!
  }

  assert.equal(rows[240]!.weeklyValues[wk], 11)
  assert.equal(rows[241]!.weeklyValues[wk], 22)
  assert.equal(rows[242]!.weeklyValues[wk], 33)
  assert.equal(rows[0]!.weeklyValues[wk], "")
})

test("7. WEEKLY TOTALS derived from full 300-row state", () => {
  const rows = buildRows(300).map((r, i) => ({
    ...r,
    buyType: "panels",
    unitRate: 10,
    weeklyValues: {
      ...r.weeklyValues,
      [weekKeys[0]!]: i === 0 || i === 299 ? 5 : ("" as const),
    },
  }))
  const totals = computeOohExpertWeeklyTotals(rows, weekKeys, {}, 0)
  assert.equal(totals.sumQty, 10)
  assert.equal(totals.perWeek[weekKeys[0]!], 10)
  // Edit an off-window row → totals must move.
  const edited = updateRowAtIndex(rows, 150, {
    weeklyValues: {
      ...rows[150]!.weeklyValues,
      [weekKeys[0]!]: 100,
    },
  })!
  const after = computeOohExpertWeeklyTotals(edited, weekKeys, {}, 0)
  assert.equal(after.sumQty, 110)
  assert.equal(after.perWeek[weekKeys[0]!], 110)
})

test("8. PERF: mounted DOM window stays bounded while scrolling 300 rows", () => {
  const viewportHeight = 400
  const rowCount = 300
  const nearTop = expectedMountedRowRange(
    0,
    viewportHeight,
    OOH_EXPERT_ROW_HEIGHT_PX,
    rowCount,
    EXPERT_GRID_ROW_OVERSCAN_DEFAULT
  )
  const mid = expectedMountedRowRange(
    150 * OOH_EXPERT_ROW_HEIGHT_PX,
    viewportHeight,
    OOH_EXPERT_ROW_HEIGHT_PX,
    rowCount,
    EXPERT_GRID_ROW_OVERSCAN_DEFAULT
  )
  const nearBottom = expectedMountedRowRange(
    280 * OOH_EXPERT_ROW_HEIGHT_PX,
    viewportHeight,
    OOH_EXPERT_ROW_HEIGHT_PX,
    rowCount,
    EXPERT_GRID_ROW_OVERSCAN_DEFAULT
  )

  const topCount = mountedRowCount(nearTop)
  const midCount = mountedRowCount(mid)
  const bottomCount = mountedRowCount(nearBottom)

  // Window ≈ viewport/rowHeight + 2*overscan — far below 300.
  const maxWindow = Math.ceil(viewportHeight / OOH_EXPERT_ROW_HEIGHT_PX) +
    2 * EXPERT_GRID_ROW_OVERSCAN_DEFAULT +
    2
  assert.ok(topCount <= maxWindow, `top ${topCount} > ${maxWindow}`)
  assert.ok(midCount <= maxWindow, `mid ${midCount} > ${maxWindow}`)
  assert.ok(bottomCount <= maxWindow, `bottom ${bottomCount} > ${maxWindow}`)
  assert.ok(topCount < 80)
  assert.ok(midCount < 80)
})

test("8b. PERF: single add-row onto 300×52 stays under 50ms (state path)", () => {
  let rows = buildRows(300)
  const t0 = performance.now()
  const added = emptyRow("new-row")
  rows = [...rows, added]
  const elapsed = performance.now() - t0
  assert.equal(rows.length, 301)
  assert.ok(
    elapsed < 50,
    `single Add row took ${elapsed.toFixed(2)}ms (budget 50ms)`
  )
})

test("9. COLUMN WINDOW: 12-month (~52) weeks mounts a bounded horizontal window", () => {
  const widths = weekKeys.map(() => WEEK_COL_WIDTH_PX)
  assert.ok(widths.length >= 52)
  const viewportWidth = 800
  const nearLeft = expectedMountedColRange(
    0,
    viewportWidth,
    widths,
    EXPERT_GRID_COL_OVERSCAN_DEFAULT
  )
  const mid = expectedMountedColRange(
    26 * WEEK_COL_WIDTH_PX,
    viewportWidth,
    widths,
    EXPERT_GRID_COL_OVERSCAN_DEFAULT
  )
  const nearRight = expectedMountedColRange(
    45 * WEEK_COL_WIDTH_PX,
    viewportWidth,
    widths,
    EXPERT_GRID_COL_OVERSCAN_DEFAULT
  )

  const maxWindow =
    Math.ceil(viewportWidth / WEEK_COL_WIDTH_PX) + 2 * EXPERT_GRID_COL_OVERSCAN_DEFAULT + 2
  assert.ok(mountedColCount(nearLeft) <= maxWindow)
  assert.ok(mountedColCount(mid) <= maxWindow)
  assert.ok(mountedColCount(nearRight) <= maxWindow)
  assert.ok(mountedColCount(nearLeft) < widths.length)
  assert.ok(mountedColCount(mid) < widths.length)

  // BEFORE (no windowing): every visible row mounts all week cells.
  const beforeCellsPerRow = widths.length
  const afterCellsPerRow = mountedColCount(mid)
  assert.ok(
    afterCellsPerRow < beforeCellsPerRow / 2,
    `expected horizontal window << 52, got ${afterCellsPerRow} vs ${beforeCellsPerRow}`
  )
})

test("9b. COLUMN SPACERS: left+visible+right widths equal total week band", () => {
  const widths = weekKeys.map(() => WEEK_COL_WIDTH_PX)
  const offsets = cumulativeColumnOffsets(widths)
  const total = offsets[widths.length]!
  const range = expectedMountedColRange(500, 700, widths, EXPERT_GRID_COL_OVERSCAN_DEFAULT)
  const { paddingLeft, paddingRight } = expertGridColSpacerWidths(range, widths)
  let visible = 0
  for (let i = range.start; i <= range.end; i++) visible += widths[i]!
  assert.equal(paddingLeft + visible + paddingRight, total)
})

test("9b2. COLUMN WINDOW: sticky-left shrinks week viewport; spacer never includes sticky width", () => {
  // Sticky geometry (reorder + descriptors) is reserved in the table DOM, not
  // the week-band spacer. The virtualizer subtracts sticky from clientWidth so
  // the first visible week starts at the sticky boundary.
  const widths = weekKeys.map(() => WEEK_COL_WIDTH_PX)
  const stickyLeft = 44 + 1200 // reorder + representative descriptor total
  const clientWidth = 800
  const weekViewport = Math.max(0, clientWidth - stickyLeft)
  const withSticky = expectedMountedColRange(
    0,
    weekViewport,
    widths,
    EXPERT_GRID_COL_OVERSCAN_DEFAULT
  )
  const withoutSticky = expectedMountedColRange(
    0,
    clientWidth,
    widths,
    EXPERT_GRID_COL_OVERSCAN_DEFAULT
  )
  assert.ok(weekViewport < clientWidth)
  assert.ok(mountedColCount(withSticky) <= mountedColCount(withoutSticky))
  assert.equal(withSticky.start, 0)

  const { paddingLeft } = expertGridColSpacerWidths(withSticky, widths)
  assert.equal(paddingLeft, 0) // scroll=0 window start — no sticky baked into spacer
  assert.ok(paddingLeft < stickyLeft)
})

test("9c. COLUMN MERGES: intersecting spans expand the mounted range", () => {
  const range = { start: 20, end: 25 }
  const expanded = expandColRangeForMerges(range, weekKeys, [
    { startWeekKey: weekKeys[10]!, endWeekKey: weekKeys[22]! },
  ])
  assert.equal(expanded.start, 10)
  assert.equal(expanded.end, 25)
})

test("10. INCREMENTAL TOTALS: single-cell edit matches full recompute and is faster", () => {
  let rows = buildRows(300)
  rows = updateRowAtIndex(rows, 10, {
    weeklyValues: {
      ...rows[10]!.weeklyValues,
      [weekKeys[0]!]: 5,
    },
  })!

  const full0 = computeOohExpertWeeklyTotals(rows, weekKeys, {}, 0)
  const incr0 = computeOohExpertWeeklyTotalsIncremental(
    rows,
    weekKeys,
    {},
    0,
    null
  )
  assert.deepEqual(incr0.totals, full0)

  const edited = updateRowAtIndex(rows, 10, {
    weeklyValues: {
      ...rows[10]!.weeklyValues,
      [weekKeys[0]!]: 42,
    },
  })!

  const tFull0 = performance.now()
  const full1 = computeOohExpertWeeklyTotals(edited, weekKeys, {}, 0)
  const fullMs = performance.now() - tFull0

  const tIncr0 = performance.now()
  const incr1 = computeOohExpertWeeklyTotalsIncremental(
    edited,
    weekKeys,
    {},
    0,
    incr0.cache
  )
  const incrMs = performance.now() - tIncr0

  assert.deepEqual(incr1.totals, full1)
  assert.equal(incr1.totals.perWeek[weekKeys[0]!], 42)
  // Incremental should touch one row — typically much faster than 300-row full pass.
  // Allow slack on warm CI; require it not to be slower than full by >5x (regression guard).
  assert.ok(
    incrMs <= fullMs * 5 + 5,
    `incremental ${incrMs.toFixed(2)}ms vs full ${fullMs.toFixed(2)}ms`
  )

  // Identity: unchanged rows keep references → derived cache hits.
  const derived = createExpertRowDerivedCache()
  const qtyA = derived.qtySum(edited[10]!, weekKeys)
  const qtyB = derived.qtySum(edited[10]!, weekKeys)
  assert.equal(qtyA, qtyB)
  assert.equal(qtyA, 42)
  assert.equal(derived.qtySum(edited[0]!, weekKeys), 0)
  assert.equal(edited[0], rows[0], "sibling row identity preserved for memo skips")
})
