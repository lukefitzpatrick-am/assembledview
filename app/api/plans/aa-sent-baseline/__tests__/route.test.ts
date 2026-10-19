/**
 * GET /api/plans/aa-sent-baseline — plan publishers only.
 * Requires Node 22+ module mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../lib/test/mockModuleHarness.js"

const skip = mockModuleSkip()

type AccessResult =
  | { ok: true; isClient: boolean }
  | { ok: false; response: NextResponse }

type RoleResult =
  | { response: NextResponse }
  | {
      session: { user: { email: string } }
      roles: readonly ["admin"]
      clientSlug: null
      grantedByAllowlist: boolean
    }

type SentPack = {
  billingMonth: string
  versionId: number
  sentAt: string
  aaAmountsByMonth: Record<string, number>
}

const checkClientMbaAccessMock = mock.fn(
  async (_request: NextRequest, _mba: string): Promise<AccessResult> => ({
    ok: true,
    isClient: false,
  }),
)

const requireRoleMock = mock.fn(
  async (_request: NextRequest, _roles: string[]): Promise<RoleResult> => ({
    session: { user: { email: "publisher@assembledmedia.com.au" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }),
)

const loadSentAaBaselineMock = mock.fn(
  async (_mba: string): Promise<SentPack[]> => [],
)

if (supportsMockModule()) {
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: { checkClientMbaAccess: checkClientMbaAccessMock },
  })
  await mock.module!("@/lib/requireRole", {
    namedExports: { requireRole: requireRoleMock },
  })
  await mock.module!("@/lib/finance/billingPartner/sentAaBaseline", {
    namedExports: { loadSentAaBaseline: loadSentAaBaselineMock },
  })
}

function getRequest(mba: string | null) {
  const query = mba == null ? "" : `?mba=${encodeURIComponent(mba)}`
  return new NextRequest(`http://localhost/api/plans/aa-sent-baseline${query}`)
}

test("GET aa-sent-baseline — client user is 403", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  requireRoleMock.mock.resetCalls()
  loadSentAaBaselineMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({ ok: true, isClient: true }))
  requireRoleMock.mock.mockImplementation(async () => ({
    response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  }))

  const { GET } = await import("../route.js")
  const res = await GET(getRequest("krusty002"))

  assert.equal(res.status, 403)
  assert.equal(loadSentAaBaselineMock.mock.calls.length, 0)
  assert.deepEqual(requireRoleMock.mock.calls[0]?.arguments[1], ["admin"])
})

test("GET aa-sent-baseline — publisher is 200", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  requireRoleMock.mock.resetCalls()
  loadSentAaBaselineMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({ ok: true, isClient: false }))
  requireRoleMock.mock.mockImplementation(async () => ({
    session: { user: { email: "publisher@assembledmedia.com.au" } },
    roles: ["admin"] as const,
    clientSlug: null,
    grantedByAllowlist: false,
  }))
  loadSentAaBaselineMock.mock.mockImplementation(async () => [
    {
      billingMonth: "2026-11-01",
      versionId: 40,
      sentAt: "2026-11-17T00:00:00.000Z",
      aaAmountsByMonth: { "2026-11": 50 },
    },
  ])

  const { GET } = await import("../route.js")
  const res = await GET(getRequest("krusty002"))
  const body = await res.json()

  assert.equal(res.status, 200)
  assert.equal(body.sentPacks.length, 1)
  assert.equal(body.sentPacks[0].versionId, 40)
  assert.equal(loadSentAaBaselineMock.mock.calls[0]?.arguments[0], "krusty002")
})

test("GET aa-sent-baseline — invalid MBA is 400", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  requireRoleMock.mock.resetCalls()
  loadSentAaBaselineMock.mock.resetCalls()

  const { GET } = await import("../route.js")
  const res = await GET(getRequest("krusty 002"))

  assert.equal(res.status, 400)
  assert.equal(checkClientMbaAccessMock.mock.calls.length, 0)
  assert.equal(requireRoleMock.mock.calls.length, 0)
  assert.equal(loadSentAaBaselineMock.mock.calls.length, 0)
})
