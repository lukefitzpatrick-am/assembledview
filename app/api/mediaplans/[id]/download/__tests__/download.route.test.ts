/**
 * GET /api/mediaplans/[id]/download — published version attachment.
 * Tenant via checkClientMbaAccess. Requires Node 22+ module mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../../lib/test/mockModuleHarness.js"

const skip = mockModuleSkip()

const checkClientMbaAccessMock = mock.fn(
  async (_req: unknown, _mba: string) =>
    ({ ok: true, isClient: false }) as
      | { ok: true; isClient: boolean }
      | { ok: false; response: NextResponse },
)

const aaFile = {
  url: "https://blob.vercel-storage.com/plans/aa.xlsx",
  pathname: "plans/aa.xlsx",
  name: "Glendale_AA_v6.xlsx",
}

const readVersionForDownloadMock = mock.fn(async (_id: number) => ({
  id: 42,
  mbaNumber: "glenda008",
  versionNumber: 6,
  publishedAt: "2026-09-05T04:00:00.000Z",
  mbaPdfFile: { path: "https://a2.xano.io/vault/mba.pdf", name: "mba.pdf" },
  mediaPlanFile: { path: "https://a2.xano.io/vault/mp.xlsx", name: "mp.xlsx" },
  aaMediaPlanFile: aaFile,
}))

const servePlanFileAttachmentMock = mock.fn(async (_file: unknown) => {
  return new NextResponse("xlsx-bytes", {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Glendale_AA_v6.xlsx"',
    },
  })
})

if (supportsMockModule()) {
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: {
      checkClientMbaAccess: checkClientMbaAccessMock,
    },
  })
  await mock.module!("@/lib/docs/readPublishedVersionDocuments", {
    namedExports: {
      readVersionForDownload: readVersionForDownloadMock,
    },
  })
  await mock.module!("@/lib/docs/servePlanFile", {
    namedExports: {
      servePlanFileAttachment: servePlanFileAttachmentMock,
    },
  })
}

function getRequest(id: string, kind?: string) {
  const url = new URL(`http://localhost/api/mediaplans/${id}/download`)
  if (kind) url.searchParams.set("kind", kind)
  return new NextRequest(url)
}

test("GET download — kind=aa_media_plan is served as an attachment", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  readVersionForDownloadMock.mock.resetCalls()
  servePlanFileAttachmentMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({ ok: true, isClient: false }))

  const { GET } = await import("../route.js")
  const res = await GET(getRequest("42", "aa_media_plan"), {
    params: Promise.resolve({ id: "42" }),
  })
  assert.equal(res.status, 200)
  assert.match(res.headers.get("Content-Disposition") ?? "", /attachment/)
  assert.equal(servePlanFileAttachmentMock.mock.calls.length, 1)
  assert.equal(servePlanFileAttachmentMock.mock.calls[0]!.arguments[0], aaFile)
})

test("GET download — jsonb with no url returns 404 NOT_SAVED", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  servePlanFileAttachmentMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({ ok: true, isClient: false }))
  readVersionForDownloadMock.mock.mockImplementation(async () => ({
    id: 42,
    mbaNumber: "glenda008",
    versionNumber: 6,
    publishedAt: "2026-09-05T04:00:00.000Z",
    mbaPdfFile: { name: "mba.pdf" },
    mediaPlanFile: { path: "https://a2.xano.io/vault/mp.xlsx", name: "mp.xlsx" },
    aaMediaPlanFile: null,
  }))

  const { GET } = await import("../route.js")
  const res = await GET(getRequest("42", "mba_pdf"), {
    params: Promise.resolve({ id: "42" }),
  })
  assert.equal(res.status, 404)
  const body = await res.json()
  assert.equal(body.code, "NOT_SAVED")
  assert.equal(servePlanFileAttachmentMock.mock.calls.length, 0)
})

test("GET download — client role on own MBA is 200", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  servePlanFileAttachmentMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({ ok: true, isClient: true }))
  readVersionForDownloadMock.mock.mockImplementation(async () => ({
    id: 42,
    mbaNumber: "glenda008",
    versionNumber: 6,
    publishedAt: "2026-09-05T04:00:00.000Z",
    mbaPdfFile: { path: "https://a2.xano.io/vault/mba.pdf", name: "mba.pdf" },
    mediaPlanFile: { path: "https://a2.xano.io/vault/mp.xlsx", name: "mp.xlsx" },
    aaMediaPlanFile: aaFile,
  }))

  const { GET } = await import("../route.js")
  const res = await GET(getRequest("42", "media_plan"), {
    params: Promise.resolve({ id: "42" }),
  })
  assert.equal(res.status, 200)
  assert.equal(checkClientMbaAccessMock.mock.calls[0]!.arguments[1], "glenda008")
})

test("GET download — client role on another tenant MBA is 403", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  servePlanFileAttachmentMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({
    ok: false,
    response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
  }))
  readVersionForDownloadMock.mock.mockImplementation(async () => ({
    id: 99,
    mbaNumber: "hema001",
    versionNumber: 1,
    publishedAt: "2026-09-05T04:00:00.000Z",
    mbaPdfFile: { path: "https://a2.xano.io/vault/mba.pdf", name: "mba.pdf" },
    mediaPlanFile: null,
    aaMediaPlanFile: null,
  }))

  const { GET } = await import("../route.js")
  const res = await GET(getRequest("99", "mba_pdf"), {
    params: Promise.resolve({ id: "99" }),
  })
  assert.equal(res.status, 403)
  assert.equal(servePlanFileAttachmentMock.mock.calls.length, 0)
})
