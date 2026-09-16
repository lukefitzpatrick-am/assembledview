/**
 * ExpertGrid week paste: merged-span clipboard + external paste on a span.
 *
 * Run: tsx --test lib/mediaplan/__tests__/expertGridPaste.test.ts
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  applyWeeklyCutToRows,
  applyWeeklyPasteMatrixToSelection,
  buildWeeklyExportTsv,
  copiedWeekSpansFromSelection,
  normalizeWeekMergeSelection,
  type ExpertGridRowWithWeekly,
} from "../expertGridShared"
import type { WeeklyGanttWeekColumn } from "@/lib/utils/weeklyGanttColumns"

const SPAN_WEEK_KEYS = [
  "2026-01-05",
  "2026-01-12",
  "2026-01-19",
  "2026-01-26",
  "2026-02-02",
  "2026-02-09",
] as const

function weekCols(keys: readonly string[]): WeeklyGanttWeekColumn[] {
  return keys.map((weekKey) => ({
    weekKey,
    weekStart: new Date(weekKey),
    weekEnd: new Date(weekKey),
    labelShort: weekKey,
    labelFull: weekKey,
  }))
}

function emptyWeekly(): ExpertGridRowWithWeekly["weeklyValues"] {
  const weeklyValues: ExpertGridRowWithWeekly["weeklyValues"] = {}
  for (const k of SPAN_WEEK_KEYS) weeklyValues[k] = ""
  return weeklyValues
}

function spanRow(
  start: string,
  end: string,
  qty: number,
  id = "s1"
): ExpertGridRowWithWeekly {
  return {
    weeklyValues: emptyWeekly(),
    mergedWeekSpans: [
      { id, startWeekKey: start, endWeekKey: end, totalQty: qty },
    ],
  }
}

function pasteWeek(args: {
  rows: ExpertGridRowWithWeekly[]
  matrix: string[][]
  anchorWeekKey: string
  copiedSpans?: ReturnType<typeof copiedWeekSpansFromSelection>
  weekRectSelection?: {
    rowStart: number
    rowEnd: number
    weekKeyStart: string
    weekKeyEnd: string
  } | null
}) {
  const nextRows = args.rows.map((r) => ({
    ...r,
    weeklyValues: { ...r.weeklyValues },
    mergedWeekSpans: [...(r.mergedWeekSpans ?? [])],
  }))
  const result = applyWeeklyPasteMatrixToSelection({
    matrix: args.matrix,
    weekColumns: weekCols(SPAN_WEEK_KEYS),
    anchorRow: 0,
    anchorWeekKey: args.anchorWeekKey,
    weekRectSelection: args.weekRectSelection ?? null,
    weekStripSelection: null,
    weekMultiSelect: null,
    weekKeys: SPAN_WEEK_KEYS,
    rowCount: nextRows.length,
    nextRows,
    copiedSpans: args.copiedSpans,
  })
  return { nextRows, result }
}

test("copy-span-paste recreates the merged span at the destination", () => {
  const rows = [spanRow("2026-01-05", "2026-01-19", 42)]
  const sel = {
    kind: "rect" as const,
    rect: {
      rowStart: 0,
      rowEnd: 0,
      weekKeyStart: "2026-01-05",
      weekKeyEnd: "2026-01-19",
    },
  }
  const tsv = buildWeeklyExportTsv(sel, rows, SPAN_WEEK_KEYS)
  assert.equal(tsv, "42\t\t")
  const spans = copiedWeekSpansFromSelection(sel, rows, SPAN_WEEK_KEYS)
  assert.deepEqual(spans, [
    { rowOffset: 0, startColOffset: 0, endColOffset: 2, anchorValue: 42 },
  ])

  const dest: ExpertGridRowWithWeekly = { weeklyValues: emptyWeekly() }
  const { nextRows } = pasteWeek({
    rows: [dest],
    matrix: [["42", "", ""]],
    anchorWeekKey: "2026-01-26",
    copiedSpans: spans,
  })
  const created = nextRows[0]!.mergedWeekSpans ?? []
  assert.equal(created.length, 1)
  assert.equal(created[0]!.startWeekKey, "2026-01-26")
  assert.equal(created[0]!.endWeekKey, "2026-02-09")
  assert.equal(created[0]!.totalQty, 42)
  assert.equal(nextRows[0]!.weeklyValues["2026-01-26"], "")
  assert.equal(nextRows[0]!.weeklyValues["2026-02-02"], "")
  assert.equal(nextRows[0]!.weeklyValues["2026-02-09"], "")
})

test("paste-over-span dissolves the dest span then recreates the copied span", () => {
  const source = [spanRow("2026-01-05", "2026-01-19", 42)]
  const sel = {
    kind: "rect" as const,
    rect: {
      rowStart: 0,
      rowEnd: 0,
      weekKeyStart: "2026-01-05",
      weekKeyEnd: "2026-01-19",
    },
  }
  const spans = copiedWeekSpansFromSelection(sel, source, SPAN_WEEK_KEYS)
  const dest = spanRow("2026-01-26", "2026-02-09", 99, "dest")
  const { nextRows } = pasteWeek({
    rows: [dest],
    matrix: [["42", "", ""]],
    anchorWeekKey: "2026-01-26",
    copiedSpans: spans,
  })
  const created = nextRows[0]!.mergedWeekSpans ?? []
  assert.equal(created.length, 1)
  assert.notEqual(created[0]!.id, "dest")
  assert.equal(created[0]!.startWeekKey, "2026-01-26")
  assert.equal(created[0]!.endWeekKey, "2026-02-09")
  assert.equal(created[0]!.totalQty, 42)
})

test("cut-span-paste keeps the source span zeroed and pastes a new span", () => {
  const rows = [spanRow("2026-01-05", "2026-01-19", 42)]
  const sel = {
    kind: "rect" as const,
    rect: {
      rowStart: 0,
      rowEnd: 0,
      weekKeyStart: "2026-01-05",
      weekKeyEnd: "2026-01-19",
    },
  }
  const spans = copiedWeekSpansFromSelection(sel, rows, SPAN_WEEK_KEYS)
  const cut = applyWeeklyCutToRows(sel, rows, SPAN_WEEK_KEYS)
  assert.ok(cut)
  assert.equal(cut![0]!.mergedWeekSpans?.[0]?.id, "s1")
  assert.equal(cut![0]!.mergedWeekSpans?.[0]?.totalQty, 0)

  const dest: ExpertGridRowWithWeekly = { weeklyValues: emptyWeekly() }
  const { nextRows } = pasteWeek({
    rows: [dest],
    matrix: [["42", "", ""]],
    anchorWeekKey: "2026-01-26",
    copiedSpans: spans,
  })
  assert.equal(nextRows[0]!.mergedWeekSpans?.[0]?.startWeekKey, "2026-01-26")
  assert.equal(nextRows[0]!.mergedWeekSpans?.[0]?.totalQty, 42)
})

test("external-paste-on-span writes the anchor and never interiors", () => {
  const dest = spanRow("2026-01-05", "2026-01-19", 10)
  const interior = pasteWeek({
    rows: [dest],
    matrix: [["99"]],
    anchorWeekKey: "2026-01-12",
  })
  assert.equal(interior.nextRows[0]!.mergedWeekSpans?.[0]?.totalQty, 10)
  assert.equal(interior.nextRows[0]!.weeklyValues["2026-01-12"], "")

  const anchor = pasteWeek({
    rows: [dest],
    matrix: [["99"]],
    anchorWeekKey: "2026-01-05",
  })
  assert.equal(anchor.nextRows[0]!.mergedWeekSpans?.[0]?.totalQty, 99)
  assert.equal(anchor.nextRows[0]!.mergedWeekSpans?.[0]?.id, "s1")
})

test("single selected week cell can be merged into a one-week span", () => {
  const n = normalizeWeekMergeSelection(
    {
      rowStart: 0,
      rowEnd: 0,
      weekKeyStart: "2026-01-12",
      weekKeyEnd: "2026-01-12",
    },
    null,
    SPAN_WEEK_KEYS
  )
  assert.ok(n)
  assert.deepEqual(n!.orderedWeekKeys, ["2026-01-12"])
  assert.equal(n!.anchorWeekKey, "2026-01-12")
})
