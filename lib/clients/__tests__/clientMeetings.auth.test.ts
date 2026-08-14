/**
 * GET /api/clients/[id]/meetings — admin + tenant (client exists).
 */
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

const fetchClientByIdMock = mock.fn(
  async (_id: string | number): Promise<Record<string, unknown> | null> => ({
    id: 77,
    mp_client_name: "Acme",
  }),
)

const listClientMeetingsMock = mock.fn(async (_clientId: number) => [
  {
    id: 9,
    title: "Acme weekly",
    meeting_date: "2026-04-01T00:00:00.000Z",
    duration_seconds: 1200,
    transcript_url: "https://app.fireflies.ai/view/acme",
    summary: "Talked budget.",
    auto_created_tasks: true,
  },
])

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireAdmin: requireAdminMock,
      requireRole: requireAdminMock,
    },
  })
  await mock.module!("@/lib/clients/fetchClientById", {
    namedExports: {
      fetchClientById: fetchClientByIdMock,
    },
  })
  await mock.module!("@/lib/clients/listClientMeetings", {
    namedExports: {
      listClientMeetings: listClientMeetingsMock,
    },
  })
}

async function loadRoute() {
  return import("../../../app/api/clients/[id]/meetings/route.js")
}

test("GET client meetings — client-role token gets 403 and does not query", { skip }, async () => {
  requireAdminMock.mock.resetCalls()
  listClientMeetingsMock.mock.resetCalls()
  fetchClientByIdMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  }))

  const { GET } = await loadRoute()
  const { NextRequest } = await import("next/server")
  const res = await GET(new NextRequest("http://localhost/api/clients/77/meetings"), {
    params: Promise.resolve({ id: "77" }),
  })
  assert.equal(res.status, 403)
  assert.equal(listClientMeetingsMock.mock.calls.length, 0)
  assert.equal(fetchClientByIdMock.mock.calls.length, 0)
})

test("GET client meetings — admin lists newest-first payload for the client", { skip }, async () => {
  requireAdminMock.mock.resetCalls()
  listClientMeetingsMock.mock.resetCalls()
  fetchClientByIdMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))

  const { GET } = await loadRoute()
  const { NextRequest } = await import("next/server")
  const res = await GET(new NextRequest("http://localhost/api/clients/77/meetings"), {
    params: Promise.resolve({ id: "77" }),
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.items.length, 1)
  assert.equal(body.items[0].title, "Acme weekly")
  assert.equal(listClientMeetingsMock.mock.calls[0]!.arguments[0], 77)
})

test("GET client meetings — unknown client is 404", { skip }, async () => {
  requireAdminMock.mock.resetCalls()
  listClientMeetingsMock.mock.resetCalls()
  fetchClientByIdMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))
  fetchClientByIdMock.mock.mockImplementation(async () => null)

  const { GET } = await loadRoute()
  const { NextRequest } = await import("next/server")
  const res = await GET(new NextRequest("http://localhost/api/clients/0/meetings"), {
    params: Promise.resolve({ id: "0" }),
  })
  assert.equal(res.status, 404)
  assert.equal(listClientMeetingsMock.mock.calls.length, 0)
})
