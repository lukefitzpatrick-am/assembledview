/**
 * Tenant isolation for:
 *   GET  /api/media_plans
 *   GET  /api/media_plans/<channel> (via createChannelLineItemsGetHandler)
 *   POST /api/pacing/search
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
const getSearchPacingDataMock = mock.fn(
  async (_opts?: {
    lineItemIds: string[]
    startDate?: string
    endDate?: string
    requestId?: string
    signal?: AbortSignal
  }) => ({
  totals: { cost: 1, clicks: 0, conversions: 0, revenue: 0, impressions: 0, topImpressionPct: null },
  daily: [],
  lineItems: [{ lineItemId: "hema001SE1", lineItemName: null, totals: { cost: 1, clicks: 0, conversions: 0, revenue: 0, impressions: 0, topImpressionPct: null }, daily: [] }],
  keywords: [],
}))

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
  await mock.module!("@/lib/snowflake/search-pacing-service", {
    namedExports: {
      getSearchPacingData: getSearchPacingDataMock,
    },
  })
}

function clientSession(ownMba: string) {
  return {
    user: {
      email: "client@example.com",
      app_metadata: { role: "client", mba_numbers: [ownMba] },
    },
  }
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

test("POST /api/pacing/search — client foreign lineItemIds → 403; Snowflake not called", { skip }, async () => {
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => clientSession("BICAU002"))
  checkClientMbaAccessMock.mock.resetCalls()
  getSearchPacingDataMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async (_req, mba) => {
    if (String(mba).toLowerCase() === "bicau002") {
      return { ok: true, isClient: true }
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    }
  })

  const { POST } = await import("../../../app/api/pacing/search/route.js")
  const res = await POST(
    new NextRequest("http://localhost/api/pacing/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lineItemIds: ["hema001SE1"] }),
    })
  )
  assert.equal(res.status, 403)
  assert.equal(getSearchPacingDataMock.mock.calls.length, 0)
  assert.ok(
    checkClientMbaAccessMock.mock.calls.some(
      (c) => String(c.arguments[1]).toLowerCase() === "hema001"
    )
  )
})

test("POST /api/pacing/search — client own lineItemIds unaffected; admin can read foreign", { skip }, async () => {
  getSearchPacingDataMock.mock.resetCalls()

  getSessionMock.mock.mockImplementation(async () => clientSession("BICAU002"))
  checkClientMbaAccessMock.mock.mockImplementation(async (_req, mba) => {
    if (String(mba).toLowerCase() === "bicau002") {
      return { ok: true, isClient: true }
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    }
  })
  const { POST } = await import("../../../app/api/pacing/search/route.js")
  const own = await POST(
    new NextRequest("http://localhost/api/pacing/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lineItemIds: ["BICAU002SE1"] }),
    })
  )
  assert.equal(own.status, 200)
  assert.equal(getSearchPacingDataMock.mock.calls.length, 1)

  getSearchPacingDataMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({
    user: { email: "admin@example.com", app_metadata: { role: "admin" } },
  }))
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({
    ok: true,
    isClient: false,
  }))
  const admin = await POST(
    new NextRequest("http://localhost/api/pacing/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lineItemIds: ["hema001SE1"] }),
    })
  )
  assert.equal(admin.status, 200)
  assert.equal(getSearchPacingDataMock.mock.calls.length, 1)
})

test("POST /api/pacing/search — P3 admin proceeds past unparseable junk ids", { skip }, async () => {
  getSearchPacingDataMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({
    user: { email: "admin@example.com", app_metadata: { role: "admin" } },
  }))
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({
    ok: true,
    isClient: false,
  }))

  const { POST } = await import("../../../app/api/pacing/search/route.js")
  const res = await POST(
    new NextRequest("http://localhost/api/pacing/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lineItemIds: ["not-a-line-id", "hema001SE1"],
      }),
    }),
  )
  assert.equal(res.status, 200)
  assert.equal(getSearchPacingDataMock.mock.calls.length, 1)
  const arg = getSearchPacingDataMock.mock.calls[0]!.arguments[0] as {
    lineItemIds: string[]
  }
  assert.deepEqual(arg.lineItemIds, ["hema001SE1"])
})

test("POST /api/pacing/search — P3 client unparseable id → 403 naming the id", { skip }, async () => {
  getSearchPacingDataMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => clientSession("BICAU002"))

  const { POST } = await import("../../../app/api/pacing/search/route.js")
  const res = await POST(
    new NextRequest("http://localhost/api/pacing/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lineItemIds: ["totally-junk-id"] }),
    }),
  )
  assert.equal(res.status, 403)
  const body = (await res.json()) as {
    error: string
    failedLineItemId?: string
    failedLineItemIds?: string[]
  }
  assert.equal(body.error, "forbidden")
  assert.equal(body.failedLineItemId, "totally-junk-id")
  assert.deepEqual(body.failedLineItemIds, ["totally-junk-id"])
  assert.equal(getSearchPacingDataMock.mock.calls.length, 0)
  assert.equal(checkClientMbaAccessMock.mock.calls.length, 0)
})
