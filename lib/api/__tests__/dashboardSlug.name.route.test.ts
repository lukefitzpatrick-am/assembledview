/**
 * Tenant slug membership for GET /api/dashboard/[slug]/name.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const getSessionMock = mock.fn(async (_req?: unknown) => null as null | { user: Record<string, unknown> })
const fetchRowMock = mock.fn(async (_slug: string) => null as null | Record<string, unknown>)

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: {
      auth0: { getSession: getSessionMock },
    },
  })
  await mock.module!("@/lib/clients/fetchClientRowByUrlSlug", {
    namedExports: {
      fetchXanoClientRowByUrlSlug: fetchRowMock,
    },
  })
}

const ROLE_CLAIM = "https://assembledview.com/roles"

test("GET /api/dashboard/[slug]/name — client with empty slug set is 403", { skip }, async () => {
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({
    user: {
      email: "client@example.com",
      [ROLE_CLAIM]: ["client"],
      app_metadata: { role: "client" },
    },
  }))
  fetchRowMock.mock.resetCalls()

  const { GET } = await import("../../../app/api/dashboard/[slug]/name/route.js")
  const res = await GET(new NextRequest("http://localhost/api/dashboard/golf-australia/name"), {
    params: Promise.resolve({ slug: "golf-australia" }),
  })
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { error: "forbidden" })
  assert.equal(fetchRowMock.mock.calls.length, 0)
})

test("GET /api/dashboard/[slug]/name — member slug returns display name", { skip }, async () => {
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({
    user: {
      email: "client@example.com",
      [ROLE_CLAIM]: ["client"],
      app_metadata: {
        role: "client",
        client_slug: "golf-australia",
        client_slugs: ["golf-australia", "pga-australia"],
      },
    },
  }))
  fetchRowMock.mock.resetCalls()
  fetchRowMock.mock.mockImplementation(async () => ({
    id: 20,
    mp_client_name: "PGA of Australia",
    slug: "pga-australia",
  }))

  const { GET } = await import("../../../app/api/dashboard/[slug]/name/route.js")
  const res = await GET(new NextRequest("http://localhost/api/dashboard/pga-australia/name"), {
    params: Promise.resolve({ slug: "pga-australia" }),
  })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { name: "PGA of Australia" })
})

test("GET /api/dashboard/[slug]/name — foreign slug is 403", { skip }, async () => {
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({
    user: {
      email: "client@example.com",
      [ROLE_CLAIM]: ["client"],
      app_metadata: { role: "client", client_slug: "golf-australia" },
    },
  }))
  fetchRowMock.mock.resetCalls()

  const { GET } = await import("../../../app/api/dashboard/[slug]/name/route.js")
  const res = await GET(new NextRequest("http://localhost/api/dashboard/go-golfer/name"), {
    params: Promise.resolve({ slug: "go-golfer" }),
  })
  assert.equal(res.status, 403)
  assert.equal(fetchRowMock.mock.calls.length, 0)
})
