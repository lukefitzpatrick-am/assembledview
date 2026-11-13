/**
 * B35fix (B35 review M1): both finance billing loaders read
 * `billing_ghost_row_finance_guard` and pass it to composeBillingRecordsForMonth
 * as `flagBillingAliasDuplicates`: the single-month loader
 * (`loadComposedBillingRecordsForMonth`, used by GET /api/finance/billing and the
 * approve route) and the multi-month GET (`from` / `to`). Compose itself is
 * pinned in deriveReceivableRecords.aliasDuplicates.b35.test.ts.
 * Run with --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

let switchValue = true
const readGuard = mock.fn(async (_tag: string) => switchValue)
const composeCalls: Array<Record<string, unknown>> = []
const compose = mock.fn((inputs: Record<string, unknown>) => {
  composeCalls.push(inputs)
  return []
})

if (typeof mock.module === "function") {
  await mock.module("@/lib/billing/readBillingGhostFinanceGuard", {
    namedExports: { readBillingGhostFinanceGuard: readGuard },
  })
  await mock.module("@/lib/finance/composeFinanceHubRecords", {
    namedExports: { composeBillingRecordsForMonth: compose },
  })
  await mock.module("@/lib/finance/relevantPlanVersions", {
    namedExports: {
      fetchRelevantPlanVersionsForFinanceMonth: async () => ({ relevantVersions: [] }),
      fetchRelevantPlanVersionsForFinanceMonths: async (months: string[]) =>
        new Map(months.map((m) => [m, { relevantVersions: [] }])),
    },
  })
  await mock.module("@/lib/finance/xanoReferenceCache", {
    namedExports: { getCachedClients: async () => [], getCachedPublishers: async () => [] },
  })
  await mock.module("@/lib/finance/scheduleMonthsSource", {
    namedExports: { hydrateVersionsFinanceScheduleSource: async () => {} },
  })
  await mock.module("@/lib/data/readFinance", { namedExports: { readScopeOfWork: async () => [] } })
  await mock.module("@/lib/finance/overlayFinanceStatus", {
    namedExports: {
      fetchPersistedFinanceStatusForMonth: async () => [],
      fetchAllPersistedFinanceStatusRows: async () => [],
    },
  })
  await mock.module("@/lib/requireRole", {
    namedExports: { requireFinanceAdmin: async () => ({ session: { user: { email: "f@a" } }, roles: ["finance_admin"] }) },
  })
}

const { loadComposedBillingRecordsForMonth } = await import("@/lib/finance/loadComposedBillingMonth")
const { GET } = await import("@/app/api/finance/billing/route")

test("single-month loader: the switch value reaches compose", { skip }, async () => {
  for (const value of [true, false]) {
    switchValue = value
    composeCalls.length = 0
    const out = await loadComposedBillingRecordsForMonth({ monthStr: "2026-06" })
    assert.equal(out.ok, true)
    assert.equal(composeCalls.length, 1)
    assert.equal(composeCalls[0]!.flagBillingAliasDuplicates, value)
  }
  assert.ok(readGuard.mock.calls.every((c) => c.arguments[0] === "finance-api"))
})

test("multi-month GET: the switch is read once and reaches compose for every month", { skip }, async () => {
  process.env.DATABASE_URL ||= "postgres://test"
  for (const value of [true, false]) {
    switchValue = value
    composeCalls.length = 0
    const before = readGuard.mock.callCount()
    const res = await GET(new NextRequest("http://localhost/api/finance/billing?from=2026-05&to=2026-07"))
    assert.equal(res.status, 200)
    assert.equal(readGuard.mock.callCount() - before, 1)
    assert.deepEqual(
      composeCalls.map((c) => [c.monthStr, c.flagBillingAliasDuplicates]),
      [
        ["2026-05", value],
        ["2026-06", value],
        ["2026-07", value],
      ],
    )
  }
})

test("single-month GET goes through the loader with the switch", { skip }, async () => {
  process.env.DATABASE_URL ||= "postgres://test"
  switchValue = true
  composeCalls.length = 0
  const res = await GET(new NextRequest("http://localhost/api/finance/billing?billing_month=2026-06"))
  assert.equal(res.status, 200)
  assert.equal(composeCalls.length, 1)
  assert.equal(composeCalls[0]!.flagBillingAliasDuplicates, true)
})
