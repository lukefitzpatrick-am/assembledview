import assert from "node:assert/strict"
import test from "node:test"
import {
  buildReplaceListQueryParams,
  collectRowsForVersionReplace,
} from "../../lib/api/replaceChannelLineItems.pure.js"

test("buildReplaceListQueryParams scopes by mba_number and keeps media_plan_version", () => {
  assert.deepEqual(buildReplaceListQueryParams(1020, "KRUSTY001"), {
    mba_number: "KRUSTY001",
    media_plan_version: 1020,
  })
})

test("collectRowsForVersionReplace matches media_plan_version id only", () => {
  const rows = [
    { id: 1, media_plan_version: 100, mp_plannumber: "2", line_item_id: "A" },
    { id: 2, media_plan_version: 999, mp_plannumber: "100", line_item_id: "B" },
    { id: 3, media_plan_version: "100", version_number: 7, line_item_id: "C" },
    { id: 4, mp_plannumber: "100", version_number: 100, line_item_id: "D" }, // no FK — exclude
    { media_plan_version: 100, line_item_id: "E" }, // no id — exclude
  ]

  const matched = collectRowsForVersionReplace(rows, 100)
  assert.deepEqual(
    matched.map((r) => r.id),
    [1, 3]
  )
})

test("collectRowsForVersionReplace ignores plan-number collisions", () => {
  const rows = [
    { id: 10, media_plan_version: 50, mp_plannumber: "50" },
    { id: 11, media_plan_version: 51, mp_plannumber: "50" },
  ]
  assert.deepEqual(
    collectRowsForVersionReplace(rows, 50).map((r) => r.id),
    [10]
  )
})
