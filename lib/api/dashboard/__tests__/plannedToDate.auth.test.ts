/**
 * GET /api/dashboard/planned-to-date — admin gate (matches global-monthly-*).
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"

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

const getCachedPlannedToDateMock = mock.fn(async () => ({ own001: 1000 }))

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireRole: requireRoleMock,
      requireAdmin: requireRoleMock,
    },
  })
  await mock.module!("@/lib/api/dashboard/globalSpendCache", {
    namedExports: {
      getCachedPlannedToDate: getCachedPlannedToDateMock,
      DASHBOARD_GLOBAL_SPEND_TAG: "dashboard-global-spend",
    },
  })
}

test("GET /api/dashboard/planned-to-date — client-role blocked", { skip }, async () => {
  requireRoleMock.mock.resetCalls()
  getCachedPlannedToDateMock.mock.resetCalls()
  requireRoleMock.mock.mockImplementation(async () => ({
    response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  }))

  const { GET } = await import("../../../../app/api/dashboard/planned-to-date/route.js")
  const res = await GET(
    new NextRequest("http://localhost/api/dashboard/planned-to-date?fy=2025"),
  )
  assert.equal(res.status, 403)
  assert.equal(getCachedPlannedToDateMock.mock.calls.length, 0)
  assert.equal(requireRoleMock.mock.calls.length, 1)
  assert.deepEqual(requireRoleMock.mock.calls[0]!.arguments[1], ["admin"])
})

test("GET /api/dashboard/planned-to-date — admin receives per-MBA map", { skip }, async () => {
  requireRoleMock.mock.resetCalls()
  getCachedPlannedToDateMock.mock.resetCalls()
  requireRoleMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))

  const { GET } = await import("../../../../app/api/dashboard/planned-to-date/route.js")
  const res = await GET(
    new NextRequest("http://localhost/api/dashboard/planned-to-date?fy=2025"),
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as {
    byMba: Record<string, number>
    fy: number | "all"
    generatedAt: string
  }
  assert.equal(body.fy, 2025)
  assert.deepEqual(body.byMba, { own001: 1000 })
  assert.equal(typeof body.generatedAt, "string")
  assert.equal(getCachedPlannedToDateMock.mock.calls.length, 1)
})

test("GET /api/dashboard/planned-to-date — invalid fy is 400", { skip }, async () => {
  requireRoleMock.mock.resetCalls()
  getCachedPlannedToDateMock.mock.resetCalls()
  requireRoleMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))

  const { GET } = await import("../../../../app/api/dashboard/planned-to-date/route.js")
  const res = await GET(
    new NextRequest("http://localhost/api/dashboard/planned-to-date?fy=nope"),
  )
  assert.equal(res.status, 400)
  assert.equal(getCachedPlannedToDateMock.mock.calls.length, 0)
})
