/**
 * B48 (S16 A): every switch names an owner and retires 14 days after it went
 * on (default). /admin/features shows the Melbourne date it went on and
 * flags a switch past its retirement date. Nothing retires itself.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { buildFeaturePageModel, type FeatureStateInput } from "@/lib/features/pageModel"
import { FEATURE_DEFINITIONS, RETIRE_AFTER_ON_DAYS } from "@/lib/features/registry"

const ROLES = { admin: true, financeAdmin: true }

function pageRow(state: FeatureStateInput, today: string) {
  return buildFeaturePageModel({ ready: true, states: [state], roles: ROLES, today })
    .flatMap((g) => g.rows)
    .find((r) => r.key === state.key)!
}

test("every switch has an owner; the default retirement is 14 days", () => {
  assert.equal(RETIRE_AFTER_ON_DAYS, 14)
  for (const def of FEATURE_DEFINITIONS) assert.ok(def.owner.trim(), def.key)
})

test("on since is the Melbourne date; retire after is 14 days on; flagged only after that day", () => {
  // 31 Oct 2026 22:30 UTC is 1 Nov 09:30 in Melbourne (AEDT).
  const state = { key: "true_up", enabled: true, source: "switch" as const, row: null, onSince: "2026-10-31T22:30:00+00:00" }
  const due = pageRow(state, "2026-11-15")
  assert.equal(due.onSince, "2026-11-01")
  assert.equal(due.retireAfter, "2026-11-15")
  assert.equal(due.pastRetirement, false, "the due day itself is not past")
  assert.equal(due.owner, "Luke")
  assert.equal(pageRow(state, "2026-11-16").pastRetirement, true)
})

test("a switch that is off, env-only or has no on time shows no dates and is never flagged", () => {
  for (const state of [
    { key: "true_up", enabled: false, source: "switch" as const, row: null, onSince: null },
    { key: "codex_v2", enabled: true, source: "env" as const, row: null },
    { key: "true_up", enabled: true, source: "switch" as const, row: null, onSince: "not a date" },
  ]) {
    const row = pageRow(state, "2027-06-30")
    assert.equal(row.onSince, null, state.key)
    assert.equal(row.retireAfter, null, state.key)
    assert.equal(row.pastRetirement, false, state.key)
  }
})
