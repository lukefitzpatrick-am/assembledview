/**
 * B43fix (review R3): the browser finance stores (`useFinanceStore`, the
 * Finance hub; `useFinanceScopeStore`, the sections scope bar) follow
 * `finance_melbourne_month` even when their module is evaluated before
 * ClientRoot sets the switch snapshot (a full page load). When the snapshot
 * arrives, defaults nobody has changed are rebuilt; changed ones are kept.
 *
 * Runs as a UTC host at 31 Oct 2026 13:30Z (1 Nov 00:30 AEDT), where the
 * switch off reads October and on reads November. Each case loads a fresh
 * copy of the store module (a query string on the import) with the snapshot
 * cleared first.
 */
import assert from "node:assert/strict"
import { afterEach, beforeEach, mock, test } from "node:test"

import { afterClientFeatureSnapshot, clientFeatureOn, setClientFeatureSnapshot } from "../../features/client.js"

process.env.TZ = "UTC"

const NOW = Date.parse("2026-10-31T13:30:00Z")
let copy = 0

async function freshHubStore() {
  copy += 1
  return (await import(`../useFinanceStore.ts?b43fix=${copy}`)) as typeof import("../useFinanceStore.js")
}
async function freshScopeStore() {
  copy += 1
  return (await import(`../sections/useFinanceScope.ts?b43fix=${copy}`)) as typeof import("../sections/useFinanceScope.js")
}

beforeEach(() => {
  setClientFeatureSnapshot(null)
  mock.timers.enable({ apis: ["Date"], now: NOW })
})
afterEach(() => {
  mock.timers.reset()
  setClientFeatureSnapshot(null)
})

test("hub store: loaded before the snapshot, the defaults move to the Melbourne month when it arrives with the switch on", async () => {
  const { useFinanceStore } = await freshHubStore()
  assert.deepEqual(useFinanceStore.getState().filters.monthRange, { from: "2026-10", to: "2026-10" }, "before the snapshot: off")
  setClientFeatureSnapshot({ finance_melbourne_month: true })
  const { monthRange, financialYear } = useFinanceStore.getState().filters
  assert.deepEqual(monthRange, { from: "2026-11", to: "2026-11" })
  assert.equal(financialYear, 2026)
})

test("hub store: the snapshot with the switch off keeps the host month", async () => {
  const { useFinanceStore } = await freshHubStore()
  setClientFeatureSnapshot({ finance_melbourne_month: false })
  assert.deepEqual(useFinanceStore.getState().filters.monthRange, { from: "2026-10", to: "2026-10" })
})

test("hub store: filters the person already changed are kept when the snapshot arrives", async () => {
  const { useFinanceStore } = await freshHubStore()
  useFinanceStore.getState().setFilters({ monthRange: { from: "2026-08", to: "2026-09" } })
  setClientFeatureSnapshot({ finance_melbourne_month: true })
  assert.deepEqual(useFinanceStore.getState().filters.monthRange, { from: "2026-08", to: "2026-09" })
})

test("hub store: loaded after the snapshot, it reads the switch directly", async () => {
  setClientFeatureSnapshot({ finance_melbourne_month: true })
  const { useFinanceStore } = await freshHubStore()
  assert.deepEqual(useFinanceStore.getState().filters.monthRange, { from: "2026-11", to: "2026-11" })
})

test("scope store: loaded before the snapshot, the default range ends on the Melbourne month when it arrives with the switch on", async () => {
  const { useFinanceScopeStore } = await freshScopeStore()
  assert.equal(useFinanceScopeStore.getState().applied.monthRange.to, "2026-10", "before the snapshot: off")
  const version = useFinanceScopeStore.getState().scopeVersion
  setClientFeatureSnapshot({ finance_melbourne_month: true })
  const { applied, draft, scopeVersion } = useFinanceScopeStore.getState()
  assert.equal(applied.monthRange.to, "2026-11")
  assert.equal(draft.monthRange.to, "2026-11")
  assert.equal(applied.fy, 2026)
  assert.equal(scopeVersion, version, "no refetch bump: nothing has fetched yet")
})

test("scope store: a scope already read from the URL is kept when the snapshot arrives", async () => {
  const { useFinanceScopeStore } = await freshScopeStore()
  useFinanceScopeStore.getState().hydrateFromUrl(new URLSearchParams("fy=2026&from=2026-07&to=2026-08"))
  setClientFeatureSnapshot({ finance_melbourne_month: true })
  assert.equal(useFinanceScopeStore.getState().applied.monthRange.to, "2026-08")
})

test("afterClientFeatureSnapshot runs once, on the first snapshot only, and never when the snapshot is already here", () => {
  let calls = 0
  afterClientFeatureSnapshot(() => (calls += 1))
  setClientFeatureSnapshot(null)
  assert.equal(calls, 0, "a cleared snapshot is not an arrival")
  setClientFeatureSnapshot({ finance_melbourne_month: true })
  setClientFeatureSnapshot({ finance_melbourne_month: false })
  assert.equal(calls, 1)
  afterClientFeatureSnapshot(() => (calls += 1))
  setClientFeatureSnapshot({ finance_melbourne_month: true })
  assert.equal(calls, 1, "already here: the caller's read saw it")
  assert.equal(clientFeatureOn("finance_melbourne_month"), true)
})
