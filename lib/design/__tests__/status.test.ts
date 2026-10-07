import assert from "node:assert/strict"
import test from "node:test"

import {
  BILLING_STATE,
  CAMPAIGN_PHASE,
  CODEX_TASK_STATUS,
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

test("amber and coral are not used for a positive state", () => {
  for (const [name, map] of Object.entries(MAPS)) {
    for (const [key, value] of Object.entries(map)) {
      if (!POSITIVE.has(key)) continue
      assert.notEqual(value.tone, "attention", `${name}.${key}`)
      assert.notEqual(value.tone, "critical", `${name}.${key}`)
    }
  }
})
