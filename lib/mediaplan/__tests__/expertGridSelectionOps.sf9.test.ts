/**
 * SF-9 — Expert grid multi-cell Delete / Cut / cell-range drag.
 *
 * Diagnostic only: these tests encode intended behaviour and must stay RED
 * until the next commit wires the existing selection model to those ops.
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

test("SF-9: Delete on a multi-cell selection must clear every selected week cell", () => {
  const rows = [row(10, 20, 30), row(40, 50, 60)]
  const sel = {
    kind: "rect" as const,
    rect: {
      rowStart: 0,
      rowEnd: 1,
      weekKeyStart: "2026-01-05",
      weekKeyEnd: "2026-01-12",
    },
  }
  const cleared = applyWeeklyCutToRows(sel, rows, WEEK_KEYS)
  assert.ok(cleared, "range-clear helper already exists (applyWeeklyCutToRows)")
  assert.equal(cleared![0]!.weeklyValues["2026-01-05"], "")
  assert.equal(cleared![0]!.weeklyValues["2026-01-12"], "")
  assert.equal(cleared![1]!.weeklyValues["2026-01-05"], "")
  assert.equal(cleared![1]!.weeklyValues["2026-01-12"], "")
  assert.equal(cleared![0]!.weeklyValues["2026-01-19"], 30)
  assert.equal(cleared![1]!.weeklyValues["2026-01-19"], 60)

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
    true,
    "Delete must preventDefault and range-clear; handleExpertGridInputKeyDown ignores it so the focused input eats the key"
  )
})

test("SF-9: Cut on a multi-cell selection must copy and clear every selected cell", () => {
  const rows = [row(10, 20, 30)]
  // Ctrl-click highlight: weekMultiSelect keys a+b, no rect (toggleWeekMultiSelect
  // nulls the rect). resolveWeeklyExportSelection does not take weekMultiSelect,
  // so it falls through to the focused cell and cut would only clear that cell.
  const sel = resolveWeeklyExportSelection(
    null,
    null,
    null,
    { rowIndex: 0, columnKey: "2026-01-05" },
    WEEK_KEYS,
    rows
  )
  assert.ok(sel)
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

test("SF-9: Drag-and-drop of a multi-cell selection must move every selected cell", () => {
  assert.equal(
    typeof (expertGridShared as { applyWeeklyMoveRect?: unknown }).applyWeeklyMoveRect,
    "function",
    "no rect-move helper — HTML5 drag is single-cell or merged-span only; fill-handle and row-reorder are different gestures"
  )
})
