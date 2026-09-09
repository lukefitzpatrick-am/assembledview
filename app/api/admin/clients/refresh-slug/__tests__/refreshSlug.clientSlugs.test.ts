import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../../lib/test/mockModuleHarness.js"

const skip = mockModuleSkip()

const requireAdminMock = mock.fn(async (_req: unknown) => ({
  session: { user: { email: "admin@example.com" } },
  roles: ["admin"] as const,
  clientSlug: null,
  grantedByAllowlist: false,
}))

const listAuth0UsersByClientSlugMock = mock.fn(async () => [] as Array<Record<string, unknown>>)
const updateAuth0UserMetadataMock = mock.fn(async () => undefined)
const readClientByIdMock = mock.fn(async () => ({
  status: 200,
  body: {
    id: 19,
    slug: "golf-australia-renamed",
    mp_client_name: "Golf Australia",
  },
  contentType: "application/json",
}))

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireAdmin: requireAdminMock,
    },
  })
  await mock.module!("@/lib/api/auth0Management", {
    namedExports: {
      listAuth0UsersByClientSlug: listAuth0UsersByClientSlugMock,
      updateAuth0UserMetadata: updateAuth0UserMetadataMock,
    },
  })
  await mock.module!("@/lib/data/readClients", {
    namedExports: {
      readClientById: readClientByIdMock,
    },
  })
}

function resetMocks() {
  requireAdminMock.mock.resetCalls()
  listAuth0UsersByClientSlugMock.mock.resetCalls()
  updateAuth0UserMetadataMock.mock.resetCalls()
  readClientByIdMock.mock.resetCalls()
  readClientByIdMock.mock.mockImplementation(async () => ({
    status: 200,
    body: {
      id: 19,
      slug: "golf-australia-renamed",
      mp_client_name: "Golf Australia",
    },
    contentType: "application/json",
  }))
}

test(
  "refresh-slug rewrites old slug inside client_slugs as well as client_slug",
  { skip },
  async () => {
    resetMocks()
    listAuth0UsersByClientSlugMock.mock.mockImplementation(async () => [
      {
        user_id: "auth0|primary",
        app_metadata: {
          role: "client",
          client_slug: "golf-australia",
          client_slugs: ["golf-australia", "pga-australia"],
        },
      },
      {
        user_id: "auth0|secondary",
        app_metadata: {
          role: "client",
          client_slug: "pga-australia",
          client_slugs: ["pga-australia", "golf-australia"],
        },
      },
    ])

    const { POST } = await import("../route.js")
    const req = new NextRequest("http://localhost/api/admin/clients/refresh-slug", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldSlug: "golf-australia", clientId: 19 }),
    })
    const res = await POST(req)
    assert.equal(res.status, 200)
    assert.equal(updateAuth0UserMetadataMock.mock.calls.length, 2)

    const firstArgs = updateAuth0UserMetadataMock.mock.calls[0]?.arguments as unknown[]
    const secondArgs = updateAuth0UserMetadataMock.mock.calls[1]?.arguments as unknown[]
    const first = firstArgs?.[0] as {
      userId: string
      app_metadata: Record<string, unknown>
    }
    const second = secondArgs?.[0] as {
      userId: string
      app_metadata: Record<string, unknown>
    }
    const byId = new Map(
      [first, second].map((call) => [call.userId, call.app_metadata]),
    )
    assert.equal(byId.get("auth0|primary")?.client_slug, "golf-australia-renamed")
    assert.deepEqual(byId.get("auth0|primary")?.client_slugs, [
      "golf-australia-renamed",
      "pga-australia",
    ])
    assert.equal(byId.get("auth0|secondary")?.client_slug, "pga-australia")
    assert.deepEqual(byId.get("auth0|secondary")?.client_slugs, [
      "pga-australia",
      "golf-australia-renamed",
    ])
  },
)
