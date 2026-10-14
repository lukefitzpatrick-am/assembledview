import assert from "node:assert/strict"
import { test } from "node:test"

import { builderGate } from "@/lib/webReport/builder/access"
import {
  BUILDER_NEEDS_MIGRATION,
  NEEDS_DATA_ELEMENTS,
  WEB_REPORT_VERSION_KEEP,
  addElement,
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
  assert.deepEqual(describeElementSettings("location"), [])
  assert.equal(elementNeedsData("location"), true)
  assert.equal(elementNeedsData("events"), true)
  assert.equal(elementNeedsData("srcmed"), false)
  assert.equal(elementNeedsData("kpis"), false)
  assert.ok(NEEDS_DATA_ELEMENTS.includes("gscPages"))
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
