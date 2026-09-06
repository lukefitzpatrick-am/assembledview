import assert from "node:assert/strict"
import test from "node:test"

import {
  buildDefaultFinanceScope,
  clampToCurrentMonth,
  normaliseToFy,
} from "../defaultScope.js"
import { cloneScope, parseScopeFromParams, scopesEqual } from "../scopeUrl.js"
import { normalizeSummaryQuery } from "../summaryQuery.js"
import { useFinanceScopeStore } from "../useFinanceScope.js"

const SEP_2026 = new Date(2026, 8, 6)
const JAN_2026 = new Date(2026, 0, 15)

function resetScopeStore(today: Date = new Date()) {
  const next = cloneScope(buildDefaultFinanceScope(today))
  useFinanceScopeStore.setState({
    applied: cloneScope(next),
    draft: cloneScope(next),
  })
}

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

test("normaliseToFy keeps months inside FY without current-month clamp", () => {
  const normalised = normaliseToFy(2025, { from: "2024-01", to: "2026-12" })
  assert.equal(normalised.from, "2025-07")
  assert.equal(normalised.to, "2026-06")
})

test("clampToCurrentMonth only snaps to in the current FY", () => {
  const currentFy = clampToCurrentMonth(
    2025,
    { from: "2025-07", to: "2026-06" },
    JAN_2026
  )
  assert.equal(currentFy.from, "2025-07")
  assert.equal(currentFy.to, "2026-01")

  const pastFy = clampToCurrentMonth(
    2024,
    { from: "2024-07", to: "2025-06" },
    JAN_2026
  )
  assert.equal(pastFy.from, "2024-07")
  assert.equal(pastFy.to, "2025-06")
})

test("default scope in Sep 2026 still ends at the current month", () => {
  const scope = buildDefaultFinanceScope(SEP_2026)
  assert.equal(scope.fy, 2026)
  assert.equal(scope.monthRange.from, "2026-07")
  assert.equal(scope.monthRange.to, "2026-09")
})

test("current FY Nov survives draft and Apply (FIN-K4)", () => {
  resetScopeStore(SEP_2026)
  const { setDraftMonthRange, apply } = useFinanceScopeStore.getState()
  setDraftMonthRange({ from: "2026-07", to: "2026-11" })
  assert.equal(useFinanceScopeStore.getState().draft.monthRange.to, "2026-11")
  apply()
  assert.equal(useFinanceScopeStore.getState().applied.monthRange.to, "2026-11")
  assert.equal(useFinanceScopeStore.getState().draft.monthRange.to, "2026-11")
  assert.equal(useFinanceScopeStore.getState().toSearchParams().get("to"), "2026-11")
  resetScopeStore()
})

test("URL hydrate keeps a future month in the current FY", () => {
  const parsed = parseScopeFromParams(
    new URLSearchParams("fy=2026&from=2026-07&to=2026-11"),
    SEP_2026
  )
  assert.equal(parsed.fy, 2026)
  assert.equal(parsed.monthRange.from, "2026-07")
  assert.equal(parsed.monthRange.to, "2026-11")
})

test("past FY month range is unchanged (full year still legal)", () => {
  const parsed = parseScopeFromParams(
    new URLSearchParams("fy=2024&from=2024-07&to=2025-06"),
    SEP_2026
  )
  assert.equal(parsed.fy, 2024)
  assert.equal(parsed.monthRange.from, "2024-07")
  assert.equal(parsed.monthRange.to, "2025-06")
})

test("summary query keeps a future month in the current FY (costs tiles)", () => {
  const q = normalizeSummaryQuery({
    fy: 2026,
    from: "2026-07",
    to: "2026-11",
    today: SEP_2026,
  })
  assert.equal(q.from, "2026-07")
  assert.equal(q.to, "2026-11")
})
