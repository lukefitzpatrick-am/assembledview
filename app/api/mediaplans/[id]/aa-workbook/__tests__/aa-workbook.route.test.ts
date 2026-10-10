/**
 * POST /api/mediaplans/[id]/aa-workbook — published AA workbook, no write.
 * Tenant via checkClientMbaAccess. Requires Node 22+ module mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../../lib/test/mockModuleHarness.js"

const skip = mockModuleSkip()

const checkClientMbaAccessMock = mock.fn(async (_req: unknown, _mba: string) =>
  ({ ok: true, isClient: false }) as
    | { ok: true; isClient: boolean }
    | { ok: false; response: NextResponse },
)

const readVersionForDownloadMock = mock.fn(async (_id: number) => ({
  id: 42,
  mbaNumber: "krusty002",
  versionNumber: 2,
  publishedAt: "2026-09-05T04:00:00.000Z",
  mbaPdfFile: null,
  mediaPlanFile: null,
  aaMediaPlanFile: null,
}))

const renderPlanVersionDocumentsMock = mock.fn(async (_input: unknown) => ({
  status: "ok" as const,
  results: [{ kind: "aa_media_plan" as const, status: "written" as const }],
  files: {
    aa_media_plan: {
      kind: "aa_media_plan" as const,
      filename: "Krusty - Campaign - Media Plan (AA) - v2.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("aa-bytes"),
    },
  },
  generatedFrom: { aa_media_plan: "persisted" as const },
}))

if (supportsMockModule()) {
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: { checkClientMbaAccess: checkClientMbaAccessMock },
  })
  await mock.module!("@/lib/docs/readPublishedVersionDocuments", {
    namedExports: { readVersionForDownload: readVersionForDownloadMock },
  })
  await mock.module!("@/lib/docs/renderPlanVersionDocuments", {
    namedExports: { renderPlanVersionDocuments: renderPlanVersionDocumentsMock },
  })
}

function postRequest(id: string) {
  return new NextRequest(`http://localhost/api/mediaplans/${id}/aa-workbook`, {
    method: "POST",
  })
}

test("POST aa-workbook renders the published version and writes nothing", { skip }, async () => {
  renderPlanVersionDocumentsMock.mock.resetCalls()
  const { POST } = await import("../route.js")
  const res = await POST(postRequest("42"), { params: Promise.resolve({ id: "42" }) })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("X-Document-State"), "published")
  assert.match(res.headers.get("Content-Disposition") ?? "", /Media Plan \(AA\)/)
  assert.doesNotMatch(res.headers.get("Content-Disposition") ?? "", /DRAFT/)
  assert.equal(renderPlanVersionDocumentsMock.mock.calls.length, 1)
  const input = renderPlanVersionDocumentsMock.mock.calls[0]!.arguments[0] as {
    mbaNumber: string
    versionNumber: number
    kinds: string[]
  }
  assert.equal(input.mbaNumber, "krusty002")
  assert.equal(input.versionNumber, 2)
  assert.deepEqual(input.kinds, ["aa_media_plan"])
})
