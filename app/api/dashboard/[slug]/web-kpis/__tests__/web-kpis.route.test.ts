/**
 * POST /api/dashboard/[slug]/web-kpis
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../../lib/test/mockModuleHarness.js"

const skip = mockModuleSkip()

const KPI_ID = "11111111-1111-4111-8111-111111111111"

class KpiMigrationError extends Error {}
class KpiNotFoundError extends Error {}

const getSessionMock = mock.fn(async (_req?: unknown) => null as null | { user: Record<string, unknown> })
const resolveMock = mock.fn(async (_slug?: string) => null as null | { clientId: number; clientName: string })
const upsertMock = mock.fn(async (input?: unknown) => input)
const setTargetsMock = mock.fn(async (_kpiId?: string, _clientId?: number, targets?: unknown, _actor?: string) => targets)
const deactivateMock = mock.fn(async (_kpiId?: string, _clientId?: number, _actor?: string) => true)

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: { auth0: { getSession: getSessionMock } },
  })
  await mock.module!("@/lib/webReport/builder/repo", {
    namedExports: { resolveBuilderClient: resolveMock },
  })
  await mock.module!("@/lib/webReport/kpis/repo", {
    namedExports: {
      KpiMigrationError,
      KpiNotFoundError,
      upsertKpi: upsertMock,
      setTargets: setTargetsMock,
      deactivateKpi: deactivateMock,
    },
  })
  await mock.module!("@/lib/webReport/kpis/warehouse", {
    namedExports: { loadKpiEditor: mock.fn(async () => ({ migrationApplied: true, rows: [], eventNames: [] })) },
  })
}

const ROLE_CLAIM = "https://assembledview.com/roles"

function user(role: "admin" | "client") {
  return { sub: role, email: `${role}@example.com`, [ROLE_CLAIM]: [role], app_metadata: { role } }
}

async function post(body: unknown) {
  const { POST } = await import("../route.js")
  return POST(
    new NextRequest("http://localhost/api/dashboard/golf-australia/web-kpis", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ slug: "golf-australia" }) },
  )
}

const saveTargets = { action: "targets", kpiId: KPI_ID, targets: [{ month: "2026-10-01", target: 500 }] }

test("POST web-kpis — a client is 404 and nothing is saved", { skip }, async () => {
  getSessionMock.mock.mockImplementation(async () => ({ user: user("client") }))
  setTargetsMock.mock.resetCalls()
  const res = await post(saveTargets)
  assert.equal(res.status, 404)
  assert.equal(setTargetsMock.mock.calls.length, 0)
})

test("POST web-kpis — targets save against the slug's client", { skip }, async () => {
  getSessionMock.mock.mockImplementation(async () => ({ user: user("admin") }))
  resolveMock.mock.mockImplementation(async () => ({ clientId: 7, clientName: "Golf Australia" }))
  setTargetsMock.mock.resetCalls()
  const res = await post(saveTargets)
  assert.equal(res.status, 200)
  assert.equal(setTargetsMock.mock.calls.length, 1)
  const [kpiId, clientId, targets, actor] = setTargetsMock.mock.calls[0]!.arguments
  assert.equal(kpiId, KPI_ID)
  assert.equal(clientId, 7)
  assert.deepEqual(targets, [{ month: "2026-10-01", target: 500 }])
  assert.equal(actor, "admin@example.com")
})

test("POST web-kpis — another client's KPI is 404", { skip }, async () => {
  getSessionMock.mock.mockImplementation(async () => ({ user: user("admin") }))
  resolveMock.mock.mockImplementation(async () => ({ clientId: 7, clientName: "Golf Australia" }))
  setTargetsMock.mock.mockImplementation(async () => {
    throw new KpiNotFoundError("KPI not found")
  })
  const res = await post(saveTargets)
  assert.equal(res.status, 404)
})

test("POST web-kpis — upsert takes the client from the slug, not the body", { skip }, async () => {
  getSessionMock.mock.mockImplementation(async () => ({ user: user("admin") }))
  resolveMock.mock.mockImplementation(async () => ({ clientId: 7, clientName: "Golf Australia" }))
  upsertMock.mock.resetCalls()
  const res = await post({
    action: "upsert",
    kpi: { label: "Clicks", source: "gsc_metric", metric: "clicks", clientId: 99 },
  })
  assert.equal(res.status, 200)
  const saved = upsertMock.mock.calls[0]?.arguments[0] as { clientId: number }
  assert.equal(saved.clientId, 7)
})

test("POST web-kpis — deactivate is scoped to the client", { skip }, async () => {
  getSessionMock.mock.mockImplementation(async () => ({ user: user("admin") }))
  resolveMock.mock.mockImplementation(async () => ({ clientId: 7, clientName: "Golf Australia" }))
  deactivateMock.mock.resetCalls()
  const res = await post({ action: "deactivate", kpiId: KPI_ID })
  assert.equal(res.status, 200)
  assert.deepEqual(deactivateMock.mock.calls[0]?.arguments.slice(0, 2), [KPI_ID, 7])
})
