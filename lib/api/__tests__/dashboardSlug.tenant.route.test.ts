/**
 * Tenant slug membership for GET /api/dashboard/[slug].
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const getSessionMock = mock.fn(async (_req?: unknown) => null as null | { user: Record<string, unknown> })
const getClientDashboardDataMock = mock.fn(async (_slug: string) => ({
  clientName: "Golf Australia",
  allCampaigns: [],
}))
const exportDashboardDataMock = mock.fn(async () => "csv")

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: {
      auth0: { getSession: getSessionMock },
    },
  })
  await mock.module!("@/lib/api/dashboard", {
    namedExports: {
      getClientDashboardData: getClientDashboardDataMock,
      exportDashboardData: exportDashboardDataMock,
    },
  })
}

const ROLE_CLAIM = "https://assembledview.com/roles"

test("GET /api/dashboard/[slug] — client with empty slug set is 403", { skip }, async () => {
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({
    user: {
      email: "client@example.com",
      [ROLE_CLAIM]: ["client"],
      app_metadata: { role: "client" },
    },
  }))
  getClientDashboardDataMock.mock.resetCalls()

  const { GET } = await import("../../../app/api/dashboard/[slug]/route.js")
  const res = await GET(new NextRequest("http://localhost/api/dashboard/golf-australia"), {
    params: Promise.resolve({ slug: "golf-australia" }),
  })
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { error: "forbidden" })
  assert.equal(getClientDashboardDataMock.mock.calls.length, 0)
})

test("GET /api/dashboard/[slug] — app_metadata client_slug membership still passes", { skip }, async () => {
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({
    user: {
      email: "client@example.com",
      [ROLE_CLAIM]: ["client"],
      app_metadata: { role: "client", client_slug: "golf-australia" },
    },
  }))
  getClientDashboardDataMock.mock.resetCalls()

  const { GET } = await import("../../../app/api/dashboard/[slug]/route.js")
  const res = await GET(new NextRequest("http://localhost/api/dashboard/golf-australia"), {
    params: Promise.resolve({ slug: "golf-australia" }),
  })
  assert.equal(res.status, 200)
  assert.equal(getClientDashboardDataMock.mock.calls.length, 1)
})
