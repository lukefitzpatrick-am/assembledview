/**
 * SM-11/12 — border-separate so body rows measure the virtualiser height
 * and sticky trailing cells keep their own borders.
 *
 * Run: npx tsx --test lib/mediaplan/__tests__/expertGridSticky.sm11.test.ts
 *      npx tsx --test lib/mediaplan/__tests__/expertGridDescriptorColWidthsForMode.test.ts
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import {
  cumulativeLeftOffsets,
  EXPERT_GRID_WEEK_BODY_Z,
  expertGridStickyStyleBody,
  expertGridStickyStyleHeaderCorner,
  expertGridStickyTd,
  expertGridStickyThCorner,
  expertGridStickyThWeek,
  expertGridStickyZeroWidthClass,
} from "@/components/media-containers/expertGridSticky"
import { EXPERT_GRID_BODY_ROW_HEIGHT_PX } from "@/lib/mediaplan/oohExpertVirtualization"

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..")

test("ExpertGrid table is border-separate with spacing 0 (not collapse)", () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, "components/media-containers/ExpertGrid.tsx"),
    "utf8"
  )
  assert.match(src, /<table className=\{EXPERT_GRID_TABLE_CLASS\}/)
  const stickySrc = fs.readFileSync(
    path.join(REPO_ROOT, "components/media-containers/expertGridSticky.ts"),
    "utf8"
  )
  assert.match(
    stickySrc,
    /EXPERT_GRID_TABLE_CLASS\s*=\s*"[^"]*\bborder-separate\b[^"]*\bborder-spacing-0\b/
  )
  assert.doesNotMatch(stickySrc, /EXPERT_GRID_TABLE_CLASS\s*=\s*"[^"]*\bborder-collapse\b/)
})

test("sticky header cells have exactly one bottom hairline (border-b, no compensating shadow)", () => {
  const corner = expertGridStickyThCorner()
  const week = expertGridStickyThWeek()
  assert.match(corner, /\bborder-b\b/)
  assert.match(week, /\bborder-b\b/)
  assert.doesNotMatch(corner, /shadow-\[0_1px_0_0/)
  assert.doesNotMatch(week, /shadow-\[0_1px_0_0/)
})

test("trailing header and body sticky-left offsets match (gross / actions / Σ)", () => {
  const widths = [48, 130, 88, 72, 64]
  const lefts = cumulativeLeftOffsets(widths)
  const trailingStart = 2
  for (let i = trailingStart; i < widths.length; i++) {
    const header = expertGridStickyStyleHeaderCorner(i, lefts, widths)
    const body = expertGridStickyStyleBody(i, lefts, widths)
    assert.equal(header.left, body.left, `index ${i} left`)
    assert.equal(header.width, body.width, `index ${i} width`)
    assert.ok(
      Number(body.zIndex) > 0,
      `body sticky z must beat week body (${EXPERT_GRID_WEEK_BODY_Z})`
    )
    assert.ok(
      Number(header.zIndex) > Number(body.zIndex),
      `header corner z must sit above body sticky at index ${i}`
    )
  }
})

test("sticky body cells keep opaque fills and owned borders", () => {
  const td = expertGridStickyTd()
  assert.match(td, /\bborder-b\b/)
  assert.match(td, /\bborder-r\b/)
  assert.match(td, /\bbg-background\b/)
  assert.match(td, /group-hover\/egrow:bg-table-row-hover/)
  assert.match(td, /group-focus-within\/egrow:bg-table-row-hover/)
  assert.match(td, /group-data-\[eg-zebra\]\/egrow:bg-muted/)
})

test("zero-width compact cells stay width-0 with no right border (SM-13)", () => {
  assert.equal(expertGridStickyZeroWidthClass(0), "overflow-hidden !p-0 border-r-0")
  const collapsed = expertGridStickyStyleBody(0, [0], [0])
  assert.equal(collapsed.borderRight, "none")
  assert.equal(collapsed.padding, 0)
})

test("virtualiser height stays the shared 41px constant", () => {
  assert.equal(EXPERT_GRID_BODY_ROW_HEIGHT_PX, 41)
})
