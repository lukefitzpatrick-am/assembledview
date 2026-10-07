import assert from "node:assert/strict"
import test from "node:test"

import {
  BILLING_STATE,
  CAMPAIGN_PHASE,
  CODEX_TASK_STATUS,
  DEVIATION_TONE,
  KPI_ROW_STATUS,
  PACING_TILE,
  PACING_UI_STATUS,
  TASK_PRIORITY,
  XERO_DRAFT_MATCH,
  XERO_MATCH_STATUS,
  type Tone,
} from "../status"

const TONES = new Set<Tone>([
  "outcome",
  "insight",
  "action",
  "attention",
  "critical",
  "neutral",
  "ink",
  "cancelled",
])

const MAPS = {
  PACING_UI_STATUS,
  CAMPAIGN_PHASE,
  BILLING_STATE,
  XERO_DRAFT_MATCH,
  XERO_MATCH_STATUS,
  CODEX_TASK_STATUS,
  TASK_PRIORITY,
}

const POSITIVE = new Set([
  "live",
  "paid",
  "on-track",
  "ahead",
  "Agrees",
  "agrees",
  "matched",
  "done",
])

test("every map value has a tone and a non-empty label", () => {
  for (const [name, map] of Object.entries(MAPS)) {
    for (const [key, value] of Object.entries(map)) {
      assert.ok(TONES.has(value.tone), `${name}.${key} tone ${value.tone}`)
      assert.ok(value.label.trim().length > 0, `${name}.${key} empty label`)
    }
  }
})

test("spot checks", () => {
  assert.equal(CAMPAIGN_PHASE.live.tone, "outcome")
  assert.equal(CAMPAIGN_PHASE.approved.tone, "insight")
  assert.equal(CAMPAIGN_PHASE.booked.tone, "action")
  assert.equal(BILLING_STATE.overdue.tone, "critical")
  assert.equal(PACING_UI_STATUS["on-track"].tone, "action")
  assert.equal(PACING_UI_STATUS.ahead.tone, "insight")
  assert.equal(PACING_UI_STATUS.behind.tone, "attention")
})

test("tile, kpi row, and deviation maps", () => {
  assert.equal(PACING_TILE.live.tone, null)
  assert.equal(PACING_TILE.over_pacing.tone, "attention")
  assert.equal(PACING_TILE.ahead.tone, "insight")
  assert.equal(PACING_TILE.kpi_pending.tone, "neutral")
  assert.equal(PACING_UI_STATUS["no-data"].tone, "neutral")
  assert.equal(PACING_UI_STATUS.ahead.tone, "insight")

  for (const [key, value] of Object.entries(PACING_TILE)) {
    if (key === "live") {
      assert.equal(value.tone, null)
    } else {
      assert.ok(value.tone != null && TONES.has(value.tone), `PACING_TILE.${key}`)
    }
    assert.ok(value.label && value.label.trim().length > 0, `PACING_TILE.${key} empty label`)
  }

  for (const [key, value] of Object.entries(KPI_ROW_STATUS)) {
    assert.ok(TONES.has(value.tone), `KPI_ROW_STATUS.${key}`)
    assert.ok(value.label.trim().length > 0, `KPI_ROW_STATUS.${key} empty label`)
  }
  assert.equal(KPI_ROW_STATUS["kpi-pending"].label, "KPI pending")
  assert.equal(KPI_ROW_STATUS["kpi-on-track"].tone, "action")

  assert.equal(DEVIATION_TONE(Number.NaN), "action")
  assert.equal(DEVIATION_TONE(10), "action")
  assert.equal(DEVIATION_TONE(20), "attention")
  assert.equal(DEVIATION_TONE(21), "critical")
})

test("amber and coral are not used for a positive state", () => {
  for (const [name, map] of Object.entries(MAPS)) {
    for (const [key, value] of Object.entries(map)) {
      if (!POSITIVE.has(key)) continue
      assert.notEqual(value.tone, "attention", `${name}.${key}`)
      assert.notEqual(value.tone, "critical", `${name}.${key}`)
    }
  }
})
