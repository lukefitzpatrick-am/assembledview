import assert from "node:assert/strict"
import { test } from "node:test"

import {
  NEW_ELEMENTS,
  addEntry,
  builderRequestBody,
  displayOptions,
  elementNote,
  entriesFromLayout,
  entryDisplay,
  entryWidth,
  layoutFromEntries,
  moveEntryBy,
  moveEntryTo,
  nextSelection,
  removeEntry,
  removeLastOf,
  setEntryDisplay,
  setEntrySettings,
  setEntryWidth,
} from "@/lib/webReport/builder/editor"
import { parseBuilderRequest } from "@/lib/webReport/builder/request"
import type { WebReportLayoutItem } from "@/lib/webReport/elements"

const LAYOUT: WebReportLayoutItem[] = [
  { elementId: "kpis", settings: { tiles: [{ kind: "metric", metric: "sessions" }] } },
  { elementId: "srcmed", settings: { topN: 10, columns: ["sessions"], showChange: true, shade: true } },
  { elementId: "notes", settings: { text: "Hi" } },
]

test("entries keep their key through reorder, so selection follows the element", () => {
  const entries = entriesFromLayout(LAYOUT)
  const moved = moveEntryTo(entries, 0, 2)
  assert.deepEqual(moved.map((entry) => entry.item.elementId), ["srcmed", "notes", "kpis"])
  assert.equal(nextSelection(entries, moved, "el-0"), "el-0")
  assert.deepEqual(moveEntryBy(moved, "el-0", -1).map((entry) => entry.key), ["el-1", "el-0", "el-2"])
  assert.equal(moveEntryBy(moved, "el-1", -1), moved, "moving the first element up is a no-op")
  assert.equal(moveEntryTo(entries, 0, 9), entries)
})

test("changing display only accepts the element's allowed set", () => {
  const entries = entriesFromLayout(LAYOUT)
  const donut = setEntryDisplay(entries, "el-1", "donut")
  assert.equal(entryDisplay(donut[1]), "donut")
  const bad = setEntryDisplay(donut, "el-1", "bubble")
  assert.equal(entryDisplay(bad[1]), "donut")
  assert.equal(entryDisplay(entries[0]), "tiles", "an item without display resolves to the default")
  assert.deepEqual(displayOptions("srcmed"), ["table", "bar", "donut", "treemap", "waterfall"])
})

test("changing width sets 12, 6 or 4 and defaults come from the registry", () => {
  const entries = entriesFromLayout(LAYOUT)
  assert.equal(entryWidth(entries[0]), 12)
  assert.equal(entryWidth(entries[1]), 6)
  const third = setEntryWidth(entries, "el-0", 4)
  assert.equal(entryWidth(third[0]), 4)
})

test("add and remove", () => {
  const entries = entriesFromLayout(LAYOUT)
  const added = addEntry(entries, "queries", "new-1")
  assert.equal(added.length, 4)
  assert.equal(added[3].key, "new-1")
  assert.deepEqual(added[3].item.settings, { mode: "all", topN: 15 })
  const removed = removeEntry(added, "el-1")
  assert.deepEqual(removed.map((entry) => entry.item.elementId), ["kpis", "notes", "queries"])
  assert.equal(nextSelection(added, removed, "el-1"), "el-2", "removing the selected element selects its neighbour")
  assert.equal(nextSelection(removed, [], "el-0"), null)
  const twice = addEntry(added, "queries", "new-2")
  assert.deepEqual(removeLastOf(twice, "queries").map((entry) => entry.key), ["el-0", "el-1", "el-2", "new-1"])
})

test("settings edits stay on the selected element", () => {
  const entries = entriesFromLayout(LAYOUT)
  const next = setEntrySettings(entries, "el-2", { text: "Changed" })
  assert.deepEqual(next[2].item.settings, { text: "Changed" })
  assert.equal(next[0], entries[0])
})

test("the save payload carries display and width and parses on the server", () => {
  let entries = entriesFromLayout(LAYOUT)
  entries = setEntryDisplay(entries, "el-1", "treemap")
  entries = setEntryWidth(entries, "el-1", 4)
  const body = builderRequestBody({ action: "save", entries, brandTerms: ["molicare"], period: "last_28_days" })
  assert.equal("ga4PropertyRef" in body, false, "accounts come from platform accounts, not the request")
  assert.equal("gscSiteRef" in body, false)
  assert.deepEqual(body.layout[1], {
    elementId: "srcmed",
    settings: { topN: 10, columns: ["sessions"], showChange: true, shade: true },
    display: "treemap",
    width: 4,
  })
  assert.equal("display" in body.layout[0], false, "untouched items stay without display or width")
  const parsed = parseBuilderRequest(body)
  assert.equal(parsed.ok, true)
  if (parsed.ok && parsed.action === "save") {
    assert.equal(parsed.body.layout[1].display, "treemap")
    assert.equal(parsed.body.layout[1].width, 4)
    assert.equal(parsed.body.defaultPeriod, "last_28_days")
  }
})

test("a restored layout keeps its display and width", () => {
  const restored = entriesFromLayout(
    [{ elementId: "pages", settings: { topN: 5 }, display: "bar", width: 12 }],
    "v3-1",
  )
  assert.equal(restored[0].key, "v3-1-0")
  assert.equal(entryDisplay(restored[0]), "bar")
  assert.equal(entryWidth(restored[0]), 12)
  assert.deepEqual(layoutFromEntries(restored), [{ elementId: "pages", settings: { topN: 5 }, display: "bar", width: 12 }])
})

test("notes show where the element has one", () => {
  assert.match(elementNote({ elementId: "srcmed", settings: {}, display: "donut" }) ?? "", /share of sessions/i)
  assert.equal(elementNote({ elementId: "srcmed", settings: {} }), null)
  assert.match(elementNote({ elementId: "location", settings: {} }) ?? "", /\(not set\)/)
  assert.match(elementNote({ elementId: "queries", settings: {} }) ?? "", /impression-weighted/)
  assert.deepEqual([...NEW_ELEMENTS], ["gscTrend", "queryBubble", "queryPositions", "kpiTracker"])
})
