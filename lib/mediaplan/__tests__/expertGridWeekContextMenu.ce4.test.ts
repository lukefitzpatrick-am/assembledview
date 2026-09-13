/**
 * CE4 — week-cell right-click menu selection / copy / cut / drag-guard.
 *
 * Menu items call the same helpers as Ctrl+C / Ctrl+X / Delete.
 * Range-move stays in expertGridSelectionOps.sf9.test.ts (RED backlog).
 *
 * Run: npm run test:expert-grid-selection
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  applyWeeklyCutToRows,
  asyncClipboardReadAvailable,
  buildWeeklyExportTsv,
  canOpenWeekCellContextMenu,
  requireWeeklyMenuSelection,
  resolveWeekCellContextMenuTarget,
  resolveWeekShiftClickAnchor,
  resolveWeeklyExportSelection,
  WEEK_CELL_CONTEXT_MENU_NO_SELECTION_REASON,
  weekShiftClickSelection,
  type ExpertGridRowWithWeekly,
} from "../expertGridShared.js"

const WEEK_KEYS = ["2026-01-05", "2026-01-12", "2026-01-19"] as const

function row(
  a: number,
  b: number,
  c: number
): ExpertGridRowWithWeekly {
  return {
    weeklyValues: {
      "2026-01-05": a,
      "2026-01-12": b,
      "2026-01-19": c,
    },
  }
}

const TWO_BY_TWO = {
  kind: "rect" as const,
  rect: {
    rowStart: 0,
    rowEnd: 1,
    weekKeyStart: "2026-01-05",
    weekKeyEnd: "2026-01-12",
  },
}

test("CE4: right-click inside a multi-cell selection preserves the range", () => {
  const result = resolveWeekCellContextMenuTarget(
    1,
    "2026-01-12",
    TWO_BY_TWO,
    WEEK_KEYS
  )
  assert.equal(result.action, "preserve")
})

test("CE4: right-click outside a multi-cell selection collapses to that cell", () => {
  const result = resolveWeekCellContextMenuTarget(
    0,
    "2026-01-19",
    TWO_BY_TWO,
    WEEK_KEYS
  )
  assert.equal(result.action, "collapse")
  if (result.action !== "collapse") return
  assert.equal(result.focusedCell.rowIndex, 0)
  assert.equal(result.focusedCell.columnKey, "2026-01-19")
  assert.equal(result.weekRect.rowStart, 0)
  assert.equal(result.weekRect.rowEnd, 0)
  assert.equal(result.weekRect.weekKeyStart, "2026-01-19")
  assert.equal(result.weekRect.weekKeyEnd, "2026-01-19")
})

test("CE4: menu Copy on a captured selection produces the same TSV as Ctrl+C", () => {
  const rows = [row(10, 20, 30), row(40, 50, 60)]
  const captured = TWO_BY_TWO
  const keyboardTsv = buildWeeklyExportTsv(TWO_BY_TWO, rows, WEEK_KEYS)
  const liveAfterPortalPointerDown = resolveWeeklyExportSelection(
    null,
    null,
    null,
    null,
    null,
    WEEK_KEYS,
    rows
  )
  assert.equal(liveAfterPortalPointerDown, null)
  const menuTsv = buildWeeklyExportTsv(captured, rows, WEEK_KEYS)
  assert.equal(menuTsv, keyboardTsv)
  assert.equal(menuTsv, "10\t20\n40\t50")
})

test("CE4: menu Cut clears exactly the captured cells", () => {
  const rows = [row(10, 20, 30), row(40, 50, 60)]
  const captured = TWO_BY_TWO
  const liveAfterPortalPointerDown = resolveWeeklyExportSelection(
    null,
    null,
    null,
    null,
    null,
    WEEK_KEYS,
    rows
  )
  assert.equal(liveAfterPortalPointerDown, null)
  const next = applyWeeklyCutToRows(captured, rows, WEEK_KEYS)
  assert.ok(next)
  assert.equal(next![0]!.weeklyValues["2026-01-05"], "")
  assert.equal(next![0]!.weeklyValues["2026-01-12"], "")
  assert.equal(next![1]!.weeklyValues["2026-01-05"], "")
  assert.equal(next![1]!.weeklyValues["2026-01-12"], "")
  assert.equal(next![0]!.weeklyValues["2026-01-19"], 30)
  assert.equal(next![1]!.weeklyValues["2026-01-19"], 60)
})

test("CE4: menu Delete clears on the first press with no re-select", () => {
  const rows = [row(10, 20, 30), row(40, 50, 60)]
  const captured = TWO_BY_TWO
  const liveAfterPortalPointerDown = resolveWeeklyExportSelection(
    null,
    null,
    null,
    null,
    null,
    WEEK_KEYS,
    rows
  )
  assert.equal(
    liveAfterPortalPointerDown,
    null,
    "live selection is gone after body-portal pointerdown — Delete must not wait for a re-select"
  )
  const firstPress = applyWeeklyCutToRows(captured, rows, WEEK_KEYS)
  assert.ok(firstPress)
  assert.equal(firstPress![0]!.weeklyValues["2026-01-05"], "")
  assert.equal(firstPress![0]!.weeklyValues["2026-01-12"], "")
  assert.equal(firstPress![1]!.weeklyValues["2026-01-05"], "")
  assert.equal(firstPress![1]!.weeklyValues["2026-01-12"], "")
  assert.equal(firstPress![0]!.weeklyValues["2026-01-19"], 30)
  assert.equal(firstPress![1]!.weeklyValues["2026-01-19"], 60)
})

test("CE4: a null menu selection surfaces a reason instead of returning silently", () => {
  const missing = requireWeeklyMenuSelection(null)
  assert.equal(missing.ok, false)
  if (missing.ok) return
  assert.equal(missing.reason, WEEK_CELL_CONTEXT_MENU_NO_SELECTION_REASON)
  assert.ok(missing.reason.length > 0)

  const present = requireWeeklyMenuSelection(TWO_BY_TWO)
  assert.equal(present.ok, true)
  if (!present.ok) return
  assert.equal(present.selection, TWO_BY_TWO)
})

test("CE4: week-cell context menu is suppressed while a drag is in flight", () => {
  assert.equal(
    canOpenWeekCellContextMenu({
      spanEdgeResize: { id: "span-1" },
      fillHandleDragging: false,
      weekAreaDragActive: false,
    }),
    false
  )
  assert.equal(
    canOpenWeekCellContextMenu({
      spanEdgeResize: null,
      fillHandleDragging: true,
      weekAreaDragActive: false,
    }),
    false
  )
  assert.equal(
    canOpenWeekCellContextMenu({
      spanEdgeResize: null,
      fillHandleDragging: false,
      weekAreaDragActive: true,
    }),
    false
  )
  assert.equal(
    canOpenWeekCellContextMenu({
      spanEdgeResize: null,
      fillHandleDragging: false,
      weekAreaDragActive: false,
    }),
    true
  )
})

test("CE4: menu Paste is disabled when async clipboard read is unavailable", () => {
  assert.equal(asyncClipboardReadAvailable(null), false)
  assert.equal(
    asyncClipboardReadAvailable({
      read: async () => [],
      readText: async () => "",
    }),
    true
  )
})

test("CE4: Shift+click origin prefers lastWeekAnchor over a different focused cell", () => {
  const origin = resolveWeekShiftClickAnchor(
    { rowIndex: 0, weekKey: "2026-01-05" },
    { rowIndex: 1, columnKey: "2026-01-19" },
    WEEK_KEYS
  )
  assert.deepEqual(origin, { rowIndex: 0, weekKey: "2026-01-05" })
})

test("CE4: Shift+click origin falls back to the focused week cell when lastWeekAnchor is null", () => {
  const origin = resolveWeekShiftClickAnchor(
    null,
    { rowIndex: 0, columnKey: "2026-01-05" },
    WEEK_KEYS
  )
  assert.deepEqual(origin, { rowIndex: 0, weekKey: "2026-01-05" })
})

test("CE4: Shift+click origin is null when lastWeekAnchor is null and focus is not a week cell", () => {
  assert.equal(
    resolveWeekShiftClickAnchor(
      null,
      { rowIndex: 0, columnKey: "placement" },
      WEEK_KEYS
    ),
    null
  )
  assert.equal(resolveWeekShiftClickAnchor(null, null, WEEK_KEYS), null)
})

test("CE4: Shift+click extends from the focused week cell even when live focus has already moved to the target", () => {
  const result = weekShiftClickSelection(
    null,
    { rowIndex: 0, columnKey: "2026-01-05" },
    { rowIndex: 0, weekKey: "2026-01-19" },
    WEEK_KEYS
  )
  assert.deepEqual(result.persistOrigin, { rowIndex: 0, weekKey: "2026-01-05" })
  assert.equal(result.sameRow, true)
  assert.equal(result.rect.rowStart, 0)
  assert.equal(result.rect.rowEnd, 0)
  assert.equal(result.rect.weekKeyStart, "2026-01-05")
  assert.equal(result.rect.weekKeyEnd, "2026-01-19")
})

test("CE4: Shift+click with no origin selects only the clicked cell and stores it as the origin", () => {
  const result = weekShiftClickSelection(
    null,
    null,
    { rowIndex: 1, weekKey: "2026-01-12" },
    WEEK_KEYS
  )
  assert.deepEqual(result.persistOrigin, { rowIndex: 1, weekKey: "2026-01-12" })
  assert.equal(result.sameRow, true)
  assert.equal(result.rect.weekKeyStart, "2026-01-12")
  assert.equal(result.rect.weekKeyEnd, "2026-01-12")
})

test("CE4: Shift+click lastWeekAnchor wins even when focusedCell is already the target", () => {
  const result = weekShiftClickSelection(
    { rowIndex: 0, weekKey: "2026-01-05" },
    { rowIndex: 1, columnKey: "2026-01-19" },
    { rowIndex: 1, weekKey: "2026-01-19" },
    WEEK_KEYS
  )
  assert.deepEqual(result.persistOrigin, { rowIndex: 0, weekKey: "2026-01-05" })
  assert.equal(result.sameRow, false)
  assert.equal(result.rect.rowStart, 0)
  assert.equal(result.rect.rowEnd, 1)
  assert.equal(result.rect.weekKeyStart, "2026-01-05")
  assert.equal(result.rect.weekKeyEnd, "2026-01-19")
})
