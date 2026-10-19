import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { DEFAULT_WEB_REPORT_LAYOUT, parseElementSettings, WEB_REPORT_ELEMENTS } from "../elements"

describe("web report element settings", () => {
  it("accepts the built-in layout", () => {
    assert.deepEqual(
      DEFAULT_WEB_REPORT_LAYOUT.map((item) => item.elementId),
      ["kpis", "snapshot", "traffic", "srcmed", "queries"],
    )
    for (const item of DEFAULT_WEB_REPORT_LAYOUT) {
      const parsed = parseElementSettings(item.elementId, item.settings)
      assert.equal(parsed.ok, true, item.elementId)
      assert.ok(WEB_REPORT_ELEMENTS[item.elementId].dataNeeds.length > 0)
    }
  })

  it("rejects a seventh KPI tile and a KPI tile with no metric", () => {
    const tiles = Array.from({ length: 7 }, () => ({ kind: "metric" as const, metric: "sessions" as const }))
    assert.equal(parseElementSettings("kpis", { tiles }).ok, false)
    assert.equal(parseElementSettings("kpis", { tiles: [{ kind: "metric" }] }).ok, false)
    assert.equal(parseElementSettings("kpis", { tiles: [{ kind: "keyEvent" }] }).ok, false)
    assert.equal(
      parseElementSettings("kpis", { tiles: [{ kind: "keyEvent", eventName: "purchase", target: 100 }] }).ok,
      true,
    )
  })

  it("names pages by path and keeps the landing id", () => {
    assert.equal(WEB_REPORT_ELEMENTS.landing.id, "landing")
    assert.equal(WEB_REPORT_ELEMENTS.landing.title, "Pages by path")
    assert.equal(parseElementSettings("landing", { topN: 10 }).ok, true)
  })

  it("rejects notes over the length limit and an unknown query mode", () => {
    assert.equal(parseElementSettings("notes", { text: "x".repeat(2001) }).ok, false)
    assert.equal(parseElementSettings("queries", { mode: "branded", topN: 10 }).ok, false)
    assert.equal(parseElementSettings("location", { city: "Sydney" }).ok, false)
  })
})
