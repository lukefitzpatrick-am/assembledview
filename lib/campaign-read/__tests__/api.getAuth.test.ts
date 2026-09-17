import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const checkAccessMock = mock.fn(async () => ({ ok: true as const, isClient: true }))
const requireAdminMock = mock.fn(async () => ({
  response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
}))
const failStaleMock = mock.fn(async () => 0)
const listMock = mock.fn(async (input: { includeDrafts: boolean }) => ({
  published: {
    id: 1,
    mbaNumber: "golf001",
    versionNumber: 4,
    status: "published" as const,
    beats: {
      planned: "P",
      happened: "H",
      vsPlan: "V",
      best: "B",
      worst: "W",
      upcoming: "U",
    },
    bodyMarkdown: "md",
    sources: null,
    generatedAt: "2026-09-17T00:00:00.000Z",
    generatedByEmail: "a@b.com",
    editedAt: null,
    editedByEmail: null,
    publishedAt: "2026-09-17T00:00:00.000Z",
    publishedByEmail: "a@b.com",
    errorMessage: null,
  },
  draft: input.includeDrafts
    ? {
        id: 2,
        mbaNumber: "golf001",
        versionNumber: 4,
        status: "draft" as const,
        beats: {
          planned: "draft",
          happened: "H",
          vsPlan: "V",
          best: "B",
          worst: "W",
          upcoming: "U",
        },
        bodyMarkdown: "draft-md",
        sources: null,
        generatedAt: "2026-09-17T01:00:00.000Z",
        generatedByEmail: "a@b.com",
        editedAt: null,
        editedByEmail: null,
        publishedAt: null,
        publishedByEmail: null,
        errorMessage: null,
      }
    : null,
  generating: null,
  failed: null,
  history: input.includeDrafts ? [{ id: 2 }, { id: 1 }] : [],
}))

if (supportsMockModule()) {
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: { checkClientMbaAccess: checkAccessMock },
  })
  await mock.module!("@/lib/requireRole", {
    namedExports: { requireAdmin: requireAdminMock, requireRole: requireAdminMock },
  })
  await mock.module!("@/lib/campaign-read/repo", {
    namedExports: {
      listCampaignReadsForMba: listMock,
      failStaleGeneratingReads: failStaleMock,
    },
  })
}

test("client GET returns only published", { skip }, async () => {
  listMock.mock.resetCalls()
  failStaleMock.mock.resetCalls()
  const { GET } = await import("../../../app/api/campaign-reads/route.js")
  const req = new NextRequest(
    "http://localhost/api/campaign-reads?mba=golf001&version=4",
  )
  const res = await GET(req)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.published.id, 1)
  assert.equal(body.draft, null)
  assert.deepEqual(body.history, [])
  assert.equal(listMock.mock.calls[0]!.arguments[0].includeDrafts, false)
  assert.equal(failStaleMock.mock.calls.length, 1)
})
