/**
 * Tenant isolation for:
 *   GET  /api/media_plans
 *   GET  /api/media_plans/<channel> (via createChannelLineItemsGetHandler)
 *
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const getSessionMock = mock.fn(async (_req?: unknown) => null as null | { user: Record<string, unknown> })
const checkClientMbaAccessMock = mock.fn(
  async (_req: unknown, _mba: string) =>
    ({ ok: true, isClient: false }) as
      | { ok: true; isClient: boolean }
      | { ok: false; response: Response }
)
const resolveClientMbaScopeMock = mock.fn(
  async (_req: unknown) =>
    ({
      ok: true,
      isClient: false,
      allows: () => true,
    }) as
      | { ok: false; response: Response }
      | { ok: true; isClient: boolean; allows: (mba: string) => boolean }
)
const requireRoleMock = mock.fn(async (_req: unknown, _roles: string[]) => ({
  session: { user: { email: "admin@example.com" } },
  roles: ["admin"] as string[],
  clientSlug: null,
  grantedByAllowlist: false,
}))
const getCachedMediaPlanVersionsMock = mock.fn(async () => ({
  data: [
    { mba_number: "BICAU002", mp_client_name: "BIC", version_number: 1 },
    { mba_number: "hema001", mp_client_name: "Hema", version_number: 1 },
  ],
  stale: false,
  fetchedAt: Date.now(),
}))
const fetchChannelLineItemsForMbaGetMock = mock.fn(
  async (_endpoint: string, mbaNumber: string) => [
    { line_item_id: `${mbaNumber}SM1`, mba_number: mbaNumber },
  ]
)
if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: {
      auth0: { getSession: getSessionMock },
    },
  })
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: {
      checkClientMbaAccess: checkClientMbaAccessMock,
      resolveClientMbaScope: resolveClientMbaScopeMock,
    },
  })
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireRole: requireRoleMock,
      requireAdmin: requireRoleMock,
    },
  })
  await mock.module!("@/lib/api/mediaPlanVersionsCache", {
    namedExports: {
      getCachedMediaPlanVersions: getCachedMediaPlanVersionsMock,
    },
  })
  await mock.module!("@/lib/api/fetchChannelLineItemsByMba", {
    namedExports: {
      fetchChannelLineItemsForMbaGet: fetchChannelLineItemsForMbaGetMock,
    },
  })
}

test("GET /api/media_plans — client-role only sees own MBA rows", { skip }, async () => {
  resolveClientMbaScopeMock.mock.resetCalls()
  resolveClientMbaScopeMock.mock.mockImplementation(async () => ({
    ok: true,
    isClient: true,
    allows: (mba: string) => mba.toLowerCase() === "bicau002",
  }))
  getCachedMediaPlanVersionsMock.mock.resetCalls()

  const { GET } = await import("../../../app/api/media_plans/route.js")
  const res = await GET(new NextRequest("http://localhost/api/media_plans"))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(Array.isArray(body), true)
  assert.equal(body.length, 1)
  assert.equal(body[0].mba_number, "BICAU002")
  assert.equal(getCachedMediaPlanVersionsMock.mock.calls.length, 1)
})

test("GET /api/media_plans — admin sees full book", { skip }, async () => {
  resolveClientMbaScopeMock.mock.resetCalls()
  resolveClientMbaScopeMock.mock.mockImplementation(async () => ({
    ok: true,
    isClient: false,
    allows: () => true,
  }))
  requireRoleMock.mock.resetCalls()
  requireRoleMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))

  const { GET } = await import("../../../app/api/media_plans/route.js")
  const res = await GET(new NextRequest("http://localhost/api/media_plans"))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.length, 2)
})

test("channel GET — client foreign MBA → 403; fetch not called", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  fetchChannelLineItemsForMbaGetMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({
    ok: false,
    response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
  }))

  const { createChannelLineItemsGetHandler } = await import(
    "../channelLineItemsGetHandler.js"
  )
  const GET = createChannelLineItemsGetHandler("media_plan_social", "SOCIAL")
  const res = await GET(
    new Request("http://localhost/api/media_plans/social?mba_number=hema001")
  )
  assert.equal(res.status, 403)
  assert.equal(fetchChannelLineItemsForMbaGetMock.mock.calls.length, 0)
  assert.equal(checkClientMbaAccessMock.mock.calls.length, 1)
  assert.equal(checkClientMbaAccessMock.mock.calls[0]!.arguments[1], "hema001")
})

test("channel GET — client own MBA → 200; admin unscoped → 200", { skip }, async () => {
  fetchChannelLineItemsForMbaGetMock.mock.resetCalls()

  checkClientMbaAccessMock.mock.mockImplementation(async () => ({
    ok: true,
    isClient: true,
  }))
  const { createChannelLineItemsGetHandler } = await import(
    "../channelLineItemsGetHandler.js"
  )
  const GET = createChannelLineItemsGetHandler("media_plan_social", "SOCIAL")
  const own = await GET(
    new Request("http://localhost/api/media_plans/social?mba_number=BICAU002")
  )
  assert.equal(own.status, 200)
  const ownBody = await own.json()
  assert.equal(ownBody.length, 1)

  checkClientMbaAccessMock.mock.mockImplementation(async () => ({
    ok: true,
    isClient: false,
  }))
  const admin = await GET(
    new Request("http://localhost/api/media_plans/social?mba_number=hema001")
  )
  assert.equal(admin.status, 200)
})
