/**
 * SEC-14 mediaplans/mbanumber gate.
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
