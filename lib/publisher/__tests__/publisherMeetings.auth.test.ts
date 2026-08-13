/**
 * GET /api/publishers/[publisherId]/meetings — admin + tenant (publisher exists).
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

const getPublisherByPublisherIdMock = mock.fn(
  async (_id: string): Promise<{
    id: number
    publisher_name: string
    publisherid: string
  } | null> => ({
    id: 30,
    publisher_name: "QMS",
    publisherid: "QMS",
  }),
)

const listPublisherMeetingsMock = mock.fn(async (_publisherId: number) => [
  {
    id: 9,
    title: "QMS weekly",
    meeting_date: "2026-04-01T00:00:00.000Z",
    duration_seconds: 1200,
    transcript_url: "https://app.fireflies.ai/view/qms",
  },
])

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireAdmin: requireAdminMock,
      requireRole: requireAdminMock,
    },
  })
  await mock.module!("@/lib/api/publishers", {
    namedExports: {
      getPublisherByPublisherId: getPublisherByPublisherIdMock,
    },
  })
  await mock.module!("@/lib/publisher/listPublisherMeetings", {
    namedExports: {
      listPublisherMeetings: listPublisherMeetingsMock,
    },
  })
}

async function loadRoute() {
  return import("../../../app/api/publishers/[publisherId]/meetings/route.js")
}

test("GET meetings — client-role token gets 403 and does not query", { skip }, async () => {
  requireAdminMock.mock.resetCalls()
  listPublisherMeetingsMock.mock.resetCalls()
  getPublisherByPublisherIdMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  }))

  const { GET } = await loadRoute()
  const { NextRequest } = await import("next/server")
  const res = await GET(new NextRequest("http://localhost/api/publishers/QMS/meetings"), {
    params: Promise.resolve({ publisherId: "QMS" }),
  })
  assert.equal(res.status, 403)
  assert.equal(listPublisherMeetingsMock.mock.calls.length, 0)
  assert.equal(getPublisherByPublisherIdMock.mock.calls.length, 0)
})

test("GET meetings — admin lists newest-first payload for the catalogue publisher", { skip }, async () => {
  requireAdminMock.mock.resetCalls()
  listPublisherMeetingsMock.mock.resetCalls()
  getPublisherByPublisherIdMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))

  const { GET } = await loadRoute()
  const { NextRequest } = await import("next/server")
  const res = await GET(new NextRequest("http://localhost/api/publishers/QMS/meetings"), {
    params: Promise.resolve({ publisherId: "QMS" }),
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.items.length, 1)
  assert.equal(body.items[0].title, "QMS weekly")
  assert.equal(listPublisherMeetingsMock.mock.calls[0]!.arguments[0], 30)
})

test("GET meetings — unknown publisher is 404", { skip }, async () => {
  requireAdminMock.mock.resetCalls()
  listPublisherMeetingsMock.mock.resetCalls()
  getPublisherByPublisherIdMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))
  getPublisherByPublisherIdMock.mock.mockImplementation(
    async (): Promise<{
      id: number
      publisher_name: string
      publisherid: string
    } | null> => null,
  )

  const { GET } = await loadRoute()
  const { NextRequest } = await import("next/server")
  const res = await GET(new NextRequest("http://localhost/api/publishers/nope/meetings"), {
    params: Promise.resolve({ publisherId: "nope" }),
  })
  assert.equal(res.status, 404)
  assert.equal(listPublisherMeetingsMock.mock.calls.length, 0)
})
