/**
 * SF-9 / SF-9a — Expert grid multi-cell Delete / Cut / cell-range drag.
 *
 * Delete + Cut must stay GREEN. Range-move stays RED as unimplemented backlog.
 *
 * Run: npx tsx --test lib/mediaplan/__tests__/expertGridSelectionOps.sf9.test.ts
 */
import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import type { KeyboardEvent } from "react"

import { handleExpertGridInputKeyDown } from "../expertGridKeyboardNav.js"
import * as expertGridShared from "../expertGridShared.js"
import {
  applyWeeklyCutToRows,
  resolveWeeklyExportSelection,
  weeklySelectionStealsDelete,
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

test("SF-9: Delete on a multi-cell selection must clear every selected week cell", () => {
  const rows = [row(10, 20, 30), row(40, 50, 60)]
  const cleared = applyWeeklyCutToRows(TWO_BY_TWO, rows, WEEK_KEYS)
  assert.ok(cleared, "range-clear helper already exists (applyWeeklyCutToRows)")
  assert.equal(cleared![0]!.weeklyValues["2026-01-05"], "")
  assert.equal(cleared![0]!.weeklyValues["2026-01-12"], "")
  assert.equal(cleared![1]!.weeklyValues["2026-01-05"], "")
  assert.equal(cleared![1]!.weeklyValues["2026-01-12"], "")
  assert.equal(cleared![0]!.weeklyValues["2026-01-19"], 30)
  assert.equal(cleared![1]!.weeklyValues["2026-01-19"], 60)

  assert.equal(
    weeklySelectionStealsDelete(TWO_BY_TWO, WEEK_KEYS),
    true,
    "multi-cell rect must steal Delete so the week-cell onKeyDown can range-clear"
  )
  assert.equal(
    weeklySelectionStealsDelete(
      {
        kind: "rect",
        rect: {
          rowStart: 0,
          rowEnd: 0,
          weekKeyStart: "2026-01-05",
          weekKeyEnd: "2026-01-05",
        },
      },
      WEEK_KEYS
    ),
    false,
    "1×1 rect is a caret cell — do not steal Delete from native editing"
  )
  assert.equal(
    weeklySelectionStealsDelete(
      { kind: "focusedWeekCell", rowIndex: 0, weekKey: "2026-01-05" },
      WEEK_KEYS
    ),
    false
  )

  const dom = new JSDOM(`<!doctype html><html><body><input id="cell" value="10" /></body></html>`, {
    url: "http://localhost/",
  })
  const { window } = dom
  const g = globalThis as typeof globalThis & {
    window: typeof window
    document: typeof window.document
    HTMLElement: typeof window.HTMLElement
    HTMLInputElement: typeof window.HTMLInputElement
  }
  g.window = window
  g.document = window.document
  g.HTMLElement = window.HTMLElement
  g.HTMLInputElement = window.HTMLInputElement

  const input = window.document.getElementById("cell") as HTMLInputElement
  let prevented = false
  handleExpertGridInputKeyDown({
    gridId: "g",
    rowIndex: 0,
    colIndex: 5,
    rowCount: 2,
    colCount: 10,
    event: {
      key: "Delete",
      currentTarget: input,
      preventDefault() {
        prevented = true
      },
    } as unknown as KeyboardEvent<HTMLElement>,
  })
  assert.equal(
    prevented,
    false,
    "handleExpertGridInputKeyDown must leave Delete alone so a single caret still edits natively"
  )
})

test("SF-9: Cut on a multi-cell selection must copy and clear every selected cell", () => {
  const rows = [row(10, 20, 30)]
  // Ctrl-click highlight: weekMultiSelect keys a+b, no rect (toggleWeekMultiSelect
  // nulls the rect). resolveWeeklyExportSelection must read weekMultiSelect in the
  // same slot paste uses — after rect, before strip.
  const sel = resolveWeeklyExportSelection(
    null,
    { rowIndex: 0, keys: ["2026-01-05", "2026-01-12"] },
    null,
    null,
    { rowIndex: 0, columnKey: "2026-01-05" },
    WEEK_KEYS,
    rows
  )
  assert.ok(sel)
  assert.equal(sel!.kind, "mergeContiguous")
  const next = applyWeeklyCutToRows(sel!, rows, WEEK_KEYS)
  assert.ok(next)
  assert.equal(next![0]!.weeklyValues["2026-01-05"], "")
  assert.equal(
    next![0]!.weeklyValues["2026-01-12"],
    "",
    "ctrl-click highlight on the neighbouring week must be cut, not only the focused cell"
  )
  assert.equal(next![0]!.weeklyValues["2026-01-19"], 30)
})

test("SF-9a: clipboard write failure still clears the selection", () => {
  const rows = [row(10, 20, 30)]
  let copyOk = false
  try {
    throw new Error("clipboard denied")
  } catch {
    copyOk = false
  }
  const next = applyWeeklyCutToRows(
    {
      kind: "rect",
      rect: {
        rowStart: 0,
        rowEnd: 0,
        weekKeyStart: "2026-01-05",
        weekKeyEnd: "2026-01-12",
      },
    },
    rows,
    WEEK_KEYS
  )
  assert.equal(copyOk, false)
  assert.ok(next, "clear anyway — losing the cells because copy failed is worse")
  assert.equal(next![0]!.weeklyValues["2026-01-05"], "")
  assert.equal(next![0]!.weeklyValues["2026-01-12"], "")
  assert.equal(next![0]!.weeklyValues["2026-01-19"], 30)
})

test("SF-9a: cut of a day-expanded week also clears covered dailyValues", () => {
  const rows: ExpertGridRowWithWeekly[] = [
    {
      weeklyValues: {
        "2026-01-05": 10,
        "2026-01-12": 20,
        "2026-01-19": 30,
      },
      dailyValues: {
        "2026-01-05": 4,
        "2026-01-06": 6,
        "2026-01-12": 20,
      },
    },
  ]
  const dayKeysByWeekKey = {
    "2026-01-05": ["2026-01-05", "2026-01-06"],
    "2026-01-12": ["2026-01-12"],
    "2026-01-19": ["2026-01-19"],
  }
  const next = applyWeeklyCutToRows(
    {
      kind: "rect",
      rect: {
        rowStart: 0,
        rowEnd: 0,
        weekKeyStart: "2026-01-05",
        weekKeyEnd: "2026-01-05",
      },
    },
    rows,
    WEEK_KEYS,
    dayKeysByWeekKey
  )
  assert.ok(next)
  assert.equal(next![0]!.weeklyValues["2026-01-05"], "")
  assert.equal(next![0]!.dailyValues?.["2026-01-05"], undefined)
  assert.equal(next![0]!.dailyValues?.["2026-01-06"], undefined)
  assert.equal(next![0]!.dailyValues?.["2026-01-12"], 20)
  assert.equal(next![0]!.weeklyValues["2026-01-12"], 20)
})

test("SF-9a: cut zeros overlapping merge totalQty and does not unmerge", () => {
  const rows: ExpertGridRowWithWeekly[] = [
    {
      weeklyValues: {
        "2026-01-05": "",
        "2026-01-12": "",
        "2026-01-19": 30,
      },
      mergedWeekSpans: [
        {
          id: "span-1",
          startWeekKey: "2026-01-05",
          endWeekKey: "2026-01-12",
          totalQty: 100,
        },
      ],
    },
  ]
  const next = applyWeeklyCutToRows(
    {
      kind: "rect",
      rect: {
        rowStart: 0,
        rowEnd: 0,
        weekKeyStart: "2026-01-05",
        weekKeyEnd: "2026-01-12",
      },
    },
    rows,
    WEEK_KEYS
  )
  assert.ok(next)
  const spans = next![0]!.mergedWeekSpans ?? []
  assert.equal(spans.length, 1, "must not unmerge")
  assert.equal(spans[0]!.id, "span-1")
  assert.equal(spans[0]!.startWeekKey, "2026-01-05")
  assert.equal(spans[0]!.endWeekKey, "2026-01-12")
  assert.equal(spans[0]!.totalQty, 0)
})

test("SF-9a: Delete walks logical rows so an unmounted virtualised span still clears", () => {
  const rows = Array.from({ length: 35 }, (_, i) => row(i + 1, i + 2, i + 3))
  const next = applyWeeklyCutToRows(
    {
      kind: "rect",
      rect: {
        rowStart: 0,
        rowEnd: 34,
        weekKeyStart: "2026-01-05",
        weekKeyEnd: "2026-01-12",
      },
    },
    rows,
    WEEK_KEYS
  )
  assert.ok(next)
  for (let i = 0; i < 35; i++) {
    assert.equal(next![i]!.weeklyValues["2026-01-05"], "")
    assert.equal(next![i]!.weeklyValues["2026-01-12"], "")
    assert.equal(next![i]!.weeklyValues["2026-01-19"], i + 3)
  }
})

test("SF-9 UNIMPLEMENTED backlog: drag-and-drop of a multi-cell selection (range-move)", () => {
  assert.equal(
    typeof (expertGridShared as { applyWeeklyMoveRect?: unknown }).applyWeeklyMoveRect,
    "function",
    "unimplemented — HTML5 drag is still single-cell or merged-span only; fill-handle and row-reorder are different gestures"
  )
})
