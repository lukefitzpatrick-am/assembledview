/**
 * SF-7 — horizontal focus skips merged-span holes (no element at that cell id).
 *
 * Run: npx tsx --test lib/mediaplan/__tests__/expertGridKeyboardNav.test.ts
 */
import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"

import {
  expertGridCellId,
  focusExpertGridCell,
} from "@/lib/mediaplan/expertGridKeyboardNav"

function installDom(html: string) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: "http://localhost/",
  })
  const { window } = dom
  const g = globalThis as typeof globalThis & {
    window: typeof window
    document: typeof window.document
    HTMLElement: typeof window.HTMLElement
    HTMLInputElement: typeof window.HTMLInputElement
    HTMLButtonElement: typeof window.HTMLButtonElement
  }
  g.window = window
  g.document = window.document
  g.HTMLElement = window.HTMLElement
  g.HTMLInputElement = window.HTMLInputElement
  g.HTMLButtonElement = window.HTMLButtonElement
  return window
}

test("ArrowRight through a missing merged interior id lands on the next real cell", () => {
  const gridId = "g"
  const row = 0
  // c10 = merge anchor, c11–c12 = interior holes, c13 = next week
  const window = installDom(
    `<input id="${expertGridCellId(gridId, row, 10)}" />
     <input id="${expertGridCellId(gridId, row, 13)}" />`
  )
  const ok = focusExpertGridCell(gridId, row, 11, undefined, "forward", 20)
  assert.equal(ok, true)
  assert.equal(window.document.activeElement?.id, expertGridCellId(gridId, row, 13))
})

test("ArrowLeft through a missing merged interior id lands on the merge anchor", () => {
  const gridId = "g"
  const row = 0
  const window = installDom(
    `<input id="${expertGridCellId(gridId, row, 10)}" />
     <input id="${expertGridCellId(gridId, row, 13)}" />`
  )
  const ok = focusExpertGridCell(gridId, row, 12, undefined, "back", 20)
  assert.equal(ok, true)
  assert.equal(window.document.activeElement?.id, expertGridCellId(gridId, row, 10))
})
