/**
 * SEC-14 / expected-spend local MBA gate / spend-parity admin gate.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

type RequireRoleMockResult =
  | {
      session: { user: { email: string } }
      roles: string[]
      clientSlug: null
      grantedByAllowlist: boolean
    }
  | { response: NextResponse }

const requireRoleMock = mock.fn(
  async (_req: unknown, _roles?: string[]): Promise<RequireRoleMockResult> => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"] as string[],
    clientSlug: null,
    grantedByAllowlist: false,
  }),
)

const checkClientMbaAccessMock = mock.fn(
  async (_req: unknown, _mba: string) =>
    ({ ok: true, isClient: false }) as
      | { ok: true; isClient: boolean }
      | { ok: false; response: Response },
)

const readPlanMastersMock = mock.fn(async () => [
  { mba_number: "krusty001" },
  { mba_number: "krusty002" },
])

const allocateNextMbaNumberMock = mock.fn(
  (_existing: unknown, identifier: string) => `${String(identifier).toLowerCase()}003`,
)

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireRole: requireRoleMock,
      requireAdmin: requireRoleMock,
    },
  })
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: {
      checkClientMbaAccess: checkClientMbaAccessMock,
    },
  })
  await mock.module!("@/lib/data/readMediaPlans", {
    namedExports: {
      readPlanMasters: readPlanMastersMock,
    },
  })
  await mock.module!("@/lib/mediaplan/allocateNextMbaNumber", {
    namedExports: {
      allocateNextMbaNumber: allocateNextMbaNumberMock,
    },
  })
}

test("GET /api/mediaplans/mbanumber — client-role blocked (SEC-14)", { skip }, async () => {
  requireRoleMock.mock.resetCalls()
  readPlanMastersMock.mock.resetCalls()
  requireRoleMock.mock.mockImplementation(async () => ({
    response: NextResponse.json({ error: "Unauthorized" }, { status: 403 }),
  }))

  const { GET } = await import("../../../app/api/mediaplans/mbanumber/route.js")
  const res = await GET(
    new NextRequest("http://localhost/api/mediaplans/mbanumber?mbaidentifier=krusty"),
  )
  assert.equal(res.status, 403)
  assert.equal(readPlanMastersMock.mock.calls.length, 0)
  assert.equal(requireRoleMock.mock.calls.length, 1)
  assert.deepEqual(requireRoleMock.mock.calls[0]!.arguments[1], ["admin"])
})

test("GET /api/mediaplans/mbanumber — admin mint unaffected (create-page path)", { skip }, async () => {
  requireRoleMock.mock.resetCalls()
  readPlanMastersMock.mock.resetCalls()
  allocateNextMbaNumberMock.mock.resetCalls()
  requireRoleMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))

  const { GET } = await import("../../../app/api/mediaplans/mbanumber/route.js")
  const res = await GET(
    new NextRequest("http://localhost/api/mediaplans/mbanumber?mbaidentifier=Krusty"),
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as { mba_number: string; mbanumber: string }
  assert.equal(body.mba_number, "krusty003")
  assert.equal(body.mbanumber, "krusty003")
  assert.equal(readPlanMastersMock.mock.calls.length, 1)
})

test("GET expected-spend-to-date — foreign MBA blocked before media-plan fetch", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({
    ok: false,
    response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
  }))

  const { GET } = await import(
    "../../../app/api/mediaplans/mba/[mba_number]/expected-spend-to-date/route.js"
  )
  const res = await GET(
    new NextRequest("http://localhost/api/mediaplans/mba/hema001/expected-spend-to-date"),
    { params: Promise.resolve({ mba_number: "hema001" }) },
  )
  assert.equal(res.status, 403)
  assert.equal(checkClientMbaAccessMock.mock.calls.length, 1)
  assert.equal(checkClientMbaAccessMock.mock.calls[0]!.arguments[1], "hema001")
})

test("GET expected-spend-to-date — own MBA passes local gate", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({
    ok: true,
    isClient: true,
  }))

  // Upstream media-plan fetch will fail without a real server — gate must run first.
  // Stub global fetch to prove we got past AuthZ.
  const originalFetch = globalThis.fetch
  let fetchCalled = false
  globalThis.fetch = (async () => {
    fetchCalled = true
    return new Response(
      JSON.stringify({
        campaign_start_date: "2026-01-01",
        campaign_end_date: "2026-12-31",
        lineItems: {},
        metrics: { monthlySpend: [] },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }) as typeof fetch

  try {
    const { GET } = await import(
      "../../../app/api/mediaplans/mba/[mba_number]/expected-spend-to-date/route.js"
    )
    const res = await GET(
      new NextRequest("http://localhost/api/mediaplans/mba/bicau002/expected-spend-to-date"),
      { params: Promise.resolve({ mba_number: "bicau002" }) },
    )
    assert.equal(checkClientMbaAccessMock.mock.calls.length, 1)
    assert.equal(fetchCalled, true)
    assert.equal(res.status, 200)
    const body = (await res.json()) as { expectedSpendToDate: number }
    assert.equal(typeof body.expectedSpendToDate, "number")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("GET /api/dashboard/spend-parity — non-admin blocked", { skip }, async () => {
  requireRoleMock.mock.resetCalls()
  requireRoleMock.mock.mockImplementation(async () => ({
    response: NextResponse.json({ error: "Unauthorized" }, { status: 403 }),
  }))

  const { GET } = await import("../../../app/api/dashboard/spend-parity/route.js")
  const res = await GET(new NextRequest("http://localhost/api/dashboard/spend-parity"))
  assert.equal(res.status, 403)
  assert.equal(requireRoleMock.mock.calls.length, 1)
  assert.deepEqual(requireRoleMock.mock.calls[0]!.arguments[1], ["admin"])
})

test("GET /api/dashboard/spend-parity — admin reaches handler (prod still 404)", { skip }, async () => {
  requireRoleMock.mock.resetCalls()
  requireRoleMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))

  const prev = process.env.NODE_ENV
  const env = process.env as { NODE_ENV?: string }
  env.NODE_ENV = "production"
  try {
    const { GET } = await import("../../../app/api/dashboard/spend-parity/route.js")
    const res = await GET(new NextRequest("http://localhost/api/dashboard/spend-parity"))
    assert.equal(res.status, 404)
    assert.equal(requireRoleMock.mock.calls.length, 1)
  } finally {
    env.NODE_ENV = prev
  }
})
