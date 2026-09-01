/**
 * T0-8 — admin Run/Lock must not force a period while FINANCE_PERIODS is off.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const requireRoleMock = mock.fn(async () => ({
  session: { user: { email: "admin@assembledmedia.com.au", name: "Admin" } },
  roles: ["admin"] as string[],
  clientSlug: null,
  grantedByAllowlist: false,
}))

const isFinancePeriodsEnabledMock = mock.fn(() => false)

const executeFinanceRunMock = mock.fn(async (args: { periodMonth?: string; force?: boolean }) => ({
  ok: true,
  periodMonth: args.periodMonth ?? "2026-07",
  inserted: 1,
  updated: 0,
  itemCount: 1,
}))

const executeFinanceLockMock = mock.fn(
  async (args: { periodMonth?: string; force?: boolean; lockedBy: string }) => ({
    ok: true,
    periodMonth: args.periodMonth ?? "2026-07",
    rolled: 0,
    sheetPathname: "finance-periods/2026-07/finance-sheet-v1.xlsx",
  }),
)

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: { requireRole: requireRoleMock },
  })
  await mock.module!("@/lib/finance/periods/flag", {
    namedExports: {
      isFinancePeriodsEnabled: isFinancePeriodsEnabledMock,
      getFinancePeriodsMode: () => (isFinancePeriodsEnabledMock() ? "shadow" : "off"),
    },
  })
  await mock.module!("@/lib/finance/periods/orchestrate", {
    namedExports: {
      executeFinanceRun: executeFinanceRunMock,
      executeFinanceLock: executeFinanceLockMock,
    },
  })
}

function post(path: string, body: object): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function loadRoutes() {
  const run = await import("../../../../app/api/admin/finance-periods/run/route.js")
  const lock = await import("../../../../app/api/admin/finance-periods/lock/route.js")
  return { postRun: run.POST, postLock: lock.POST }
}

test("POST /api/admin/finance-periods/run with flag off returns 409 FINANCE_PERIODS_OFF and does not run", { skip }, async () => {
  isFinancePeriodsEnabledMock.mock.mockImplementation(() => false)
  executeFinanceRunMock.mock.resetCalls()
  const { postRun } = await loadRoutes()
  const res = await postRun(post("/api/admin/finance-periods/run", { periodMonth: "2026-07" }))
  const body = (await res.json()) as { code?: string; error?: string }
  assert.equal(res.status, 409)
  assert.equal(body.code, "FINANCE_PERIODS_OFF")
  assert.ok(typeof body.error === "string" && body.error.length > 0)
  assert.equal(executeFinanceRunMock.mock.calls.length, 0, "must not create finance_periods / finance_run_items")
})

test("POST /api/admin/finance-periods/lock with flag off returns 409 FINANCE_PERIODS_OFF and does not lock", { skip }, async () => {
  isFinancePeriodsEnabledMock.mock.mockImplementation(() => false)
  executeFinanceLockMock.mock.resetCalls()
  const { postLock } = await loadRoutes()
  const res = await postLock(post("/api/admin/finance-periods/lock", { periodMonth: "2026-07" }))
  const body = (await res.json()) as { code?: string; error?: string }
  assert.equal(res.status, 409)
  assert.equal(body.code, "FINANCE_PERIODS_OFF")
  assert.ok(typeof body.error === "string" && body.error.length > 0)
  assert.equal(executeFinanceLockMock.mock.calls.length, 0, "must not create finance_periods / finance_run_items")
})

for (const mode of ["shadow", "on"] as const) {
  test(`POST /api/admin/finance-periods/run with flag ${mode} still executes (no force)`, { skip }, async () => {
    isFinancePeriodsEnabledMock.mock.mockImplementation(() => true)
    executeFinanceRunMock.mock.resetCalls()
    const { postRun } = await loadRoutes()
    const res = await postRun(post("/api/admin/finance-periods/run", { periodMonth: "2026-07" }))
    assert.equal(res.status, 200)
    const body = (await res.json()) as { ok?: boolean; periodMonth?: string }
    assert.equal(body.ok, true)
    assert.equal(body.periodMonth, "2026-07")
    assert.equal(executeFinanceRunMock.mock.calls.length, 1)
    const args = executeFinanceRunMock.mock.calls[0]!.arguments[0] as { force?: boolean; periodMonth?: string }
    assert.equal(args.periodMonth, "2026-07")
    assert.notEqual(args.force, true)
  })

  test(`POST /api/admin/finance-periods/lock with flag ${mode} still executes (no force)`, { skip }, async () => {
    isFinancePeriodsEnabledMock.mock.mockImplementation(() => true)
    executeFinanceLockMock.mock.resetCalls()
    const { postLock } = await loadRoutes()
    const res = await postLock(post("/api/admin/finance-periods/lock", { periodMonth: "2026-07" }))
    assert.equal(res.status, 200)
    const body = (await res.json()) as { ok?: boolean; periodMonth?: string }
    assert.equal(body.ok, true)
    assert.equal(body.periodMonth, "2026-07")
    assert.equal(executeFinanceLockMock.mock.calls.length, 1)
    const args = executeFinanceLockMock.mock.calls[0]!.arguments[0] as { force?: boolean; periodMonth?: string }
    assert.equal(args.periodMonth, "2026-07")
    assert.notEqual(args.force, true)
  })
}
