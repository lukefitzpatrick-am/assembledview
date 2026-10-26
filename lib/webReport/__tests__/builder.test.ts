import assert from "node:assert/strict"
import { test } from "node:test"

import { builderGate } from "@/lib/webReport/builder/access"
import {
  BUILDER_NEEDS_MIGRATION,
  NEEDS_DATA_ELEMENTS,
  WEB_REPORT_VERSION_KEEP,
  addElement,
  cleanLayout,
  defaultElementSettings,
  elementNeedsData,
  moveElement,
  parseLayout,
  planSave,
  removeElement,
  savedForMessage,
} from "@/lib/webReport/builder/layout"
import { parseBuilderRequest } from "@/lib/webReport/builder/request"
import { describeElementSettings } from "@/lib/webReport/builder/settingsForm"
import {
  WEB_REPORT_ELEMENTS,
  parseElementSettings,
  resolveDisplay,
  resolveWidth,
  type WebElementId,
  type WebReportLayoutItem,
} from "@/lib/webReport/elements"

const ROLE_CLAIM = "https://assembledview.com/roles"

function user(role: "admin" | "client") {
  return {
    sub: role,
    email: `${role}@example.com`,
    [ROLE_CLAIM]: [role],
  } as unknown as Parameters<typeof builderGate>[0]
}

test("layout add, move and remove", () => {
  const start: WebReportLayoutItem[] = []
  const added = addElement(addElement(start, "notes"), "queries")
  assert.deepEqual(
    added.map((item) => item.elementId),
    ["notes", "queries"],
  )
  assert.equal(parseElementSettings("notes", added[0]?.settings).ok, true)

  const moved = moveElement(added, 1, -1)
  assert.deepEqual(
    moved.map((item) => item.elementId),
    ["queries", "notes"],
  )
  assert.equal(moveElement(moved, 0, -1), moved)

  const down = moveElement(moved, 0, 1)
  assert.deepEqual(
    down.map((item) => item.elementId),
    ["notes", "queries"],
  )

  const removed = removeElement(down, 0)
  assert.deepEqual(
    removed.map((item) => item.elementId),
    ["queries"],
  )
  assert.equal(removeElement(removed, 4), removed)
})

test("settings validation accepts defaults and rejects a broken element", () => {
  for (const id of Object.keys(WEB_REPORT_ELEMENTS) as WebElementId[]) {
    const parsed = parseElementSettings(id, defaultElementSettings(id))
    assert.equal(parsed.ok, true, id)
  }
  assert.equal(parseElementSettings("kpis", { tiles: [] }).ok, false)
  assert.equal(parseElementSettings("kpis", { tiles: [{ kind: "metric" }] }).ok, false)
  assert.equal(parseElementSettings("kpis", { tiles: [{ kind: "keyEvent" }] }).ok, false)
  assert.equal(parseElementSettings("queries", { mode: "all", topN: 0 }).ok, false)
  assert.equal(parseElementSettings("notes", { text: "x".repeat(2001) }).ok, false)
  assert.equal(parseElementSettings("location", { extra: true }).ok, false)
  const savedLocation = parseElementSettings("location", {})
  assert.equal(savedLocation.ok, true)
  if (savedLocation.ok) assert.equal(savedLocation.settings.topN, 10)
  assert.equal(parseElementSettings("location", { topN: 0 }).ok, false)
  assert.equal(parseElementSettings("location", { topN: 51 }).ok, false)
  assert.equal(parseElementSettings("traffic", { bars: ["sessions"] }).ok, true)
})

test("settings fields are read from the element schema", () => {
  const srcmed = describeElementSettings("srcmed")
  const topN = srcmed.find((field) => field.key === "topN")
  assert.equal(topN?.kind, "number")
  if (topN?.kind === "number") {
    assert.equal(topN.integer, true)
    assert.equal(topN.min, 1)
    assert.equal(topN.max, 50)
  }
  const kpis = describeElementSettings("kpis")
  assert.equal(kpis[0]?.kind, "objectList")
  if (kpis[0]?.kind === "objectList") {
    assert.ok(kpis[0].fields.some((field) => field.key === "metric" && field.kind === "enum"))
    assert.ok(kpis[0].fields.some((field) => field.key === "target" && field.kind === "number"))
  }
  const snapshot = describeElementSettings("snapshot")
  assert.equal(snapshot[0]?.kind, "enumList")
  const location = describeElementSettings("location")
  const locationRows = location.find((field) => field.key === "topN")
  assert.equal(locationRows?.kind, "number")
  if (locationRows?.kind === "number") {
    assert.equal(locationRows.integer, true)
    assert.equal(locationRows.min, 1)
    assert.equal(locationRows.max, 50)
  }
  assert.equal(elementNeedsData("location"), false)
  assert.equal(NEEDS_DATA_ELEMENTS.includes("location"), false)
  assert.equal(elementNeedsData("events"), true)
  assert.equal(elementNeedsData("srcmed"), false)
  assert.equal(elementNeedsData("kpis"), false)
  assert.equal(elementNeedsData("gscPages"), false)
  assert.equal(NEEDS_DATA_ELEMENTS.includes("gscPages"), false)
  assert.equal(elementNeedsData("gscTrend"), false)
  assert.equal(elementNeedsData("queryBubble"), false)
  assert.equal(elementNeedsData("queryPositions"), false)
  assert.deepEqual(NEEDS_DATA_ELEMENTS, ["events"])
  assert.equal(WEB_REPORT_ELEMENTS.gscTrend.title, "Search trend")
  assert.equal(WEB_REPORT_ELEMENTS.queryBubble.displays[0], "bubble")
  assert.equal(WEB_REPORT_ELEMENTS.queryPositions.displays[0], "histogram")
})

test("a saved landing element still parses", () => {
  const saved = parseLayout([{ elementId: "landing", settings: { topN: 10 } }])
  assert.equal(saved.ok, true)
  if (saved.ok) assert.equal(saved.layout[0]?.elementId, "landing")
})

test("layout display and width fall back to the element defaults", () => {
  const bare = parseLayout([{ elementId: "traffic", settings: { bars: ["sessions"] } }])
  assert.equal(bare.ok, true)
  if (!bare.ok) return
  assert.equal(bare.layout[0]?.display, undefined)
  assert.equal(resolveDisplay(bare.layout[0]), "combo")
  assert.equal(resolveWidth(bare.layout[0]), 12)

  const kept = parseLayout([
    { elementId: "srcmed", settings: { topN: 10, columns: ["sessions"], showChange: true, shade: false }, display: "donut", width: 4 },
  ])
  assert.equal(kept.ok, true)
  if (!kept.ok) return
  assert.equal(kept.layout[0]?.display, "donut")
  assert.equal(kept.layout[0]?.width, 4)
  // Saved layouts still carry the retired showChange flag. It loads and is dropped.
  assert.deepEqual(kept.layout[0]?.settings, { topN: 10, columns: ["sessions"], shade: false })
  assert.equal(
    describeElementSettings("srcmed").some((field) => field.key === "showChange"),
    false,
  )
  assert.equal(resolveDisplay(kept.layout[0]), "donut")
  assert.equal(resolveWidth(kept.layout[0]), 4)

  const warnings: string[] = []
  const original = console.warn
  console.warn = (message?: unknown) => {
    warnings.push(String(message))
  }
  try {
    const fallback = parseLayout([
      { elementId: "notes", settings: { text: "Hi" }, display: "donut", width: 5 },
      { elementId: "notes", settings: { text: "Again" }, display: "donut", width: 7 },
    ])
    assert.equal(fallback.ok, true)
    if (!fallback.ok) return
    assert.equal(fallback.layout[0]?.display, undefined)
    assert.equal(fallback.layout[0]?.width, undefined)
    assert.equal(resolveDisplay(fallback.layout[0]), "text")
    assert.equal(resolveWidth(fallback.layout[0]), 12)
    assert.equal(resolveWidth({ elementId: "pages", settings: { topN: 10 }, width: 6 }), 6)
    assert.equal(warnings.length, 3)
  } finally {
    console.warn = original
  }

  const preview = parseBuilderRequest({
    action: "preview",
    layout: [{ elementId: "notes", settings: { text: "Hi" }, display: "text", width: 12 }],
    ga4PropertyRef: null,
    gscSiteRef: null,
    brandTerms: [],
    defaultPeriod: "last_month",
  })
  assert.equal(preview.ok, true)
  if (preview.ok && preview.action === "preview") {
    assert.equal(preview.body.layout[0]?.display, "text")
    assert.equal(preview.body.layout[0]?.width, 12)
  }

  const cleaned = cleanLayout([
    { elementId: "kpis", settings: { tiles: [{ kind: "metric", metric: "sessions" }] }, display: "spark", width: 6, extra: true },
  ])
  assert.equal(cleaned?.[0]?.display, "spark")
  assert.equal(cleaned?.[0]?.width, 6)
  assert.equal("extra" in (cleaned?.[0] ?? {}), false)
})

test("a saved location element with empty settings still parses", () => {
  const saved = parseLayout([{ elementId: "location", settings: {} }])
  assert.equal(saved.ok, true)
  if (saved.ok) assert.deepEqual(saved.layout[0]?.settings, { topN: 10 })
})

test("save plans a new version and keeps the last 10", () => {
  assert.deepEqual(planSave(0), { nextVersion: 1, dropAtOrBelow: null })
  assert.deepEqual(planSave(10), { nextVersion: 11, dropAtOrBelow: 11 - WEB_REPORT_VERSION_KEEP })
  const layout = addElement([], "paidSpend")
  const saved = parseLayout(layout)
  assert.equal(saved.ok, true)
  assert.equal(parseLayout([{ elementId: "nope", settings: {} }]).ok, false)
  assert.equal(savedForMessage("Golf Australia", 3), "Saved for Golf Australia · version 3")
  assert.equal(BUILDER_NEEDS_MIGRATION, "Builder needs migration 0098")
})

test("restore and save requests validate before a write", () => {
  const restore = parseBuilderRequest({ action: "restore", version: 4 })
  assert.equal(restore.ok, true)
  if (restore.ok && restore.action === "restore") assert.equal(restore.body.version, 4)

  const save = parseBuilderRequest({
    action: "save",
    layout: [{ elementId: "notes", settings: { text: "Hello" } }],
    ga4PropertyRef: "123",
    gscSiteRef: null,
    brandTerms: ["Golf"],
    defaultPeriod: "last_month",
  })
  assert.equal(save.ok, true)

  const invalid = parseBuilderRequest({
    action: "save",
    layout: [{ elementId: "kpis", settings: { tiles: [] } }],
    ga4PropertyRef: null,
    gscSiteRef: null,
    brandTerms: [],
    defaultPeriod: "last_28_days",
  })
  assert.equal(invalid.ok, false)
})

test("client role is not found and admin may open the builder", () => {
  assert.equal(builderGate(null), "login")
  assert.equal(builderGate(undefined), "login")
  assert.equal(builderGate(user("client")), "not_found")
  assert.equal(builderGate(user("admin")), "ok")
})
