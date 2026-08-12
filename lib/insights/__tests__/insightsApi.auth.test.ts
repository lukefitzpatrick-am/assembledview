import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

type AdminGateResult =
  | {
      session: { user: { email: string } }
      roles: string[]
      clientSlug: null
      grantedByAllowlist: boolean
    }
  | { response: Response }

const requireAdminMock = mock.fn(async (_req: unknown): Promise<AdminGateResult> => ({
  session: { user: { email: "admin@example.com" } },
  roles: ["admin"] as string[],
  clientSlug: null,
  grantedByAllowlist: false,
}))

const listCampaignInsightsMock = mock.fn(async (_filters: unknown) => [] as unknown[])

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireAdmin: requireAdminMock,
      requireRole: requireAdminMock,
    },
  })
  await mock.module!("@/lib/insights/queryCampaignInsights", {
    namedExports: {
      listCampaignInsights: listCampaignInsightsMock,
    },
  })
}

async function loadRoute() {
  return import("../../../app/api/insights/route.js")
}

test("GET /api/insights — client-role token gets 403 not empty list", { skip }, async () => {
  requireAdminMock.mock.resetCalls()
  listCampaignInsightsMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  }))

  const { GET } = await loadRoute()
  const req = new Request("http://localhost/api/insights") as unknown as import("next/server").NextRequest
  const res = await GET(req)
  assert.equal(res.status, 403)
  const body = await res.json()
  assert.equal(body.error, "forbidden")
  assert.equal(listCampaignInsightsMock.mock.calls.length, 0)
})

test("GET /api/insights — admin lists with q + filters", { skip }, async () => {
  requireAdminMock.mock.resetCalls()
  listCampaignInsightsMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))
  listCampaignInsightsMock.mock.mockImplementation(async (filters: unknown) => {
    return [
      {
        id: 1,
        mbaNumber: "bicau001",
        clientId: 9,
        period: "2026-07",
        insightType: "delivery",
        body: "Branded search CPA improved",
        source: "ava",
        confidence: null,
        createdBy: "a@b.com",
        createdAt: "2026-07-01T00:00:00Z",
        supersededBy: null,
        supersededAt: null,
        superseded: [],
      },
    ]
  })

  const { GET } = await loadRoute()
  const url =
    "http://localhost/api/insights?q=search&clientId=9&mba=BICAU001&period=2026-07&insightType=delivery&source=ava&limit=10"
  const req = new Request(url) as unknown as import("next/server").NextRequest
  // NextRequest needs nextUrl — polyfill via NextRequest if available
  const { NextRequest } = await import("next/server")
  const nextReq = new NextRequest(url)
  const res = await GET(nextReq)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.count, 1)
  assert.equal(body.items[0].body.includes("search") || body.items[0].body.includes("CPA"), true)
  assert.equal(listCampaignInsightsMock.mock.calls.length, 1)
  const filters = listCampaignInsightsMock.mock.calls[0]!.arguments[0] as Record<string, unknown>
  assert.equal(filters.q, "search")
  assert.equal(filters.clientId, 9)
  assert.equal(filters.mbaNumber, "BICAU001")
  assert.equal(filters.includeSuperseded, false)
})

test("GET /api/insights — showSuperseded toggle passes includeSuperseded", { skip }, async () => {
  requireAdminMock.mock.resetCalls()
  listCampaignInsightsMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))
  listCampaignInsightsMock.mock.mockImplementation(async () => [])

  const { GET } = await loadRoute()
  const { NextRequest } = await import("next/server")
  const res = await GET(new NextRequest("http://localhost/api/insights?showSuperseded=1"))
  assert.equal(res.status, 200)
  const filters = listCampaignInsightsMock.mock.calls[0]!.arguments[0] as Record<string, unknown>
  assert.equal(filters.includeSuperseded, true)
})
