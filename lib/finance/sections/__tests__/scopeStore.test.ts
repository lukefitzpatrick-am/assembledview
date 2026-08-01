import assert from "node:assert/strict"
import test from "node:test"

import { buildDefaultFinanceScope, clampMonthRangeToFy } from "../defaultScope.js"
import { cloneScope, parseScopeFromParams, scopesEqual } from "../scopeUrl.js"

test("default scope is current FY FY-to-date, never a single month alone when FY has elapsed months", () => {
  const scope = buildDefaultFinanceScope(new Date(2026, 0, 15))
  assert.equal(scope.fy, 2025)
  assert.equal(scope.monthRange.from, "2025-07")
  assert.equal(scope.monthRange.to, "2026-01")
  assert.notEqual(scope.monthRange.from, scope.monthRange.to)
})

test("URL round-trip preserves fy/from/to/clients", () => {
  const params = new URLSearchParams("fy=2024&from=2024-07&to=2024-12&clients=12,34")
  const parsed = parseScopeFromParams(params, new Date(2026, 0, 15))
  assert.equal(parsed.fy, 2024)
  assert.equal(parsed.monthRange.from, "2024-07")
  assert.equal(parsed.monthRange.to, "2024-12")
  assert.deepEqual(parsed.clients, [12, 34])

  const again = new URLSearchParams()
  again.set("fy", String(parsed.fy))
  again.set("from", parsed.monthRange.from)
  again.set("to", parsed.monthRange.to)
  again.set("clients", parsed.clients.join(","))
  const round = parseScopeFromParams(again, new Date(2026, 0, 15))
  assert.ok(scopesEqual(parsed, round))
})

test("apply/dirty semantics via clone equality", () => {
  const applied = buildDefaultFinanceScope(new Date(2026, 0, 15))
  const draft = cloneScope(applied)
  assert.equal(scopesEqual(draft, applied), true)
  draft.monthRange.to = "2025-09"
  assert.equal(scopesEqual(draft, applied), false)
  const committed = cloneScope(draft)
  assert.equal(scopesEqual(committed, draft), true)
})

test("clampMonthRangeToFy keeps months inside FY", () => {
  const clamped = clampMonthRangeToFy(
    2025,
    { from: "2024-01", to: "2026-12" },
    new Date(2026, 0, 15)
  )
  assert.equal(clamped.from, "2025-07")
  assert.equal(clamped.to, "2026-01")
})
