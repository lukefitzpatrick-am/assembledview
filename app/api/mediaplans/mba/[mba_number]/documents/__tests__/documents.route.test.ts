/**
 * GET /api/mediaplans/mba/[mba_number]/documents
 * Published-version file list. Tenant via checkClientMbaAccess (same helper as
 * GET /api/mediaplans/mba/[mba_number]). Requires Node 22+ module mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../../../lib/test/mockModuleHarness.js"
import { unpublishedDocumentsPayload } from "../../../../../../../lib/docs/planVersionFiles"

const skip = mockModuleSkip()

const checkClientMbaAccessMock = mock.fn(
  async (_req: unknown, _mba: string) =>
    ({ ok: true, isClient: false }) as
      | { ok: true; isClient: boolean }
      | { ok: false; response: NextResponse },
)

const readPublishedDocumentsByMbaMock = mock.fn(
  async (_mba: string) =>
    ({ ok: true as const, payload: unpublishedDocumentsPayload() }) as
      | { ok: true; payload: ReturnType<typeof unpublishedDocumentsPayload> }
      | { ok: false; status: 404 },
)

if (supportsMockModule()) {
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: {
      checkClientMbaAccess: checkClientMbaAccessMock,
    },
  })
  await mock.module!("@/lib/docs/readPublishedVersionDocuments", {
    namedExports: {
      readPublishedDocumentsByMba: readPublishedDocumentsByMbaMock,
    },
  })
}

function getRequest(mba: string) {
  return new NextRequest(`http://localhost/api/mediaplans/mba/${mba}/documents`)
}

test("GET documents — unpublished master returns 200 with nulls", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  readPublishedDocumentsByMbaMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({ ok: true, isClient: false }))
  readPublishedDocumentsByMbaMock.mock.mockImplementation(async () => ({
    ok: true,
    payload: unpublishedDocumentsPayload(),
  }))

  const { GET } = await import("../route.js")
  const res = await GET(getRequest("krusty001"), {
    params: Promise.resolve({ mba_number: "krusty001" }),
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.publishedVersionId, null)
  assert.equal(body.files.mba_pdf, null)
  assert.equal(body.files.media_plan, null)
  assert.equal(body.files.aa_media_plan, null)
})

test("GET documents — published with two of three files leaves the third null", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  readPublishedDocumentsByMbaMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({ ok: true, isClient: false }))
  readPublishedDocumentsByMbaMock.mock.mockImplementation(async () => ({
    ok: true,
    payload: {
      publishedVersionId: 42,
      versionNumber: 6,
      publishedAt: "2026-09-05T04:00:00.000Z",
      files: {
        mba_pdf: { url: "https://a2.xano.io/vault/mba.pdf", savedAt: "2026-09-05T04:00:00.000Z" },
        media_plan: { url: "https://a2.xano.io/vault/mp.xlsx", savedAt: "2026-09-05T04:00:00.000Z" },
        aa_media_plan: null,
      },
    },
  }))

  const { GET } = await import("../route.js")
  const res = await GET(getRequest("glenda008"), {
    params: Promise.resolve({ mba_number: "glenda008" }),
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.publishedVersionId, 42)
  assert.ok(body.files.mba_pdf)
  assert.ok(body.files.media_plan)
  assert.equal(body.files.aa_media_plan, null)
})

test("GET documents — client role on own MBA is 200", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  readPublishedDocumentsByMbaMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({ ok: true, isClient: true }))
  readPublishedDocumentsByMbaMock.mock.mockImplementation(async () => ({
    ok: true,
    payload: unpublishedDocumentsPayload(),
  }))

  const { GET } = await import("../route.js")
  const res = await GET(getRequest("glenda008"), {
    params: Promise.resolve({ mba_number: "glenda008" }),
  })
  assert.equal(res.status, 200)
  assert.equal(checkClientMbaAccessMock.mock.calls[0]!.arguments[1], "glenda008")
})

test("GET documents — client role on another tenant MBA is 403", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  readPublishedDocumentsByMbaMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({
    ok: false,
    response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
  }))

  const { GET } = await import("../route.js")
  const res = await GET(getRequest("hema001"), {
    params: Promise.resolve({ mba_number: "hema001" }),
  })
  assert.equal(res.status, 403)
  assert.equal(readPublishedDocumentsByMbaMock.mock.calls.length, 0)
})
