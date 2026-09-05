/**
 * POST /api/mediaplans/versions/[id]/documents/regenerate
 * Requires Node 22+ module mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../../../../lib/test/mockModuleHarness.js"

const skip = mockModuleSkip()

const requireRoleMock = mock.fn(
  async (_req: unknown, _roles: string[]) =>
    ({
      session: { user: { email: "luke@assembledmedia.com.au" } },
      roles: ["admin"] as const,
      clientSlug: null,
      grantedByAllowlist: false,
    }) as
      | {
          session: { user: { email: string } }
          roles: readonly ["admin"]
          clientSlug: null
          grantedByAllowlist: boolean
        }
      | { response: NextResponse },
)

type RegenInput = { versionId: number; kinds?: unknown; force?: boolean }
type RegenResult =
  | {
      status: "ok"
      results: Array<{
        kind: "mba_pdf" | "media_plan" | "aa_media_plan"
        status: "written" | "skipped" | "not_applicable" | "error"
        pathname?: string
        error?: string
      }>
    }
  | { status: "not_published"; code: "NOT_PUBLISHED" }
  | { status: "not_found" }

const regenerateMock = mock.fn(async (_input: RegenInput): Promise<RegenResult> => ({
  status: "ok",
  results: [
    { kind: "mba_pdf", status: "written", pathname: "plans/glenda008/v6/mba_pdf/MBA.pdf" },
    { kind: "aa_media_plan", status: "not_applicable" },
  ],
}))

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireRole: requireRoleMock,
    },
  })
  await mock.module!("@/lib/docs/regeneratePlanVersionDocuments", {
    namedExports: {
      regeneratePlanVersionDocuments: regenerateMock,
    },
  })
}

function postRequest(id: string, body: unknown) {
  return new NextRequest(
    `http://localhost/api/mediaplans/versions/${id}/documents/regenerate`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  )
}

function reset() {
  regenerateMock.mock.resetCalls()
  requireRoleMock.mock.resetCalls()
  requireRoleMock.mock.mockImplementation(async () => ({
    session: { user: { email: "luke@assembledmedia.com.au" } },
    roles: ["admin"] as const,
    clientSlug: null,
    grantedByAllowlist: false,
  }))
  regenerateMock.mock.mockImplementation(async () => ({
    status: "ok",
    results: [
      { kind: "mba_pdf", status: "written", pathname: "plans/glenda008/v6/mba_pdf/MBA.pdf" },
      { kind: "aa_media_plan", status: "not_applicable" },
    ],
  }))
}

test("POST regenerate — 422 NOT_PUBLISHED", { skip }, async () => {
  reset()
  regenerateMock.mock.mockImplementation(async () => ({
    status: "not_published",
    code: "NOT_PUBLISHED",
  }))
  const { POST } = await import("../route.js")
  const res = await POST(postRequest("13607", { force: true }), {
    params: Promise.resolve({ id: "13607" }),
  })
  assert.equal(res.status, 422)
  const body = await res.json()
  assert.equal(body.code, "NOT_PUBLISHED")
})

test("POST regenerate — admin, per-kind results, no plan-content mutation", { skip }, async () => {
  reset()
  const { POST } = await import("../route.js")
  const res = await POST(
    postRequest("13607", { kinds: ["mba_pdf", "aa_media_plan"], force: false }),
    { params: Promise.resolve({ id: "13607" }) },
  )
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.results[0].status, "written")
  assert.equal(body.results[1].status, "not_applicable")
  assert.deepEqual(requireRoleMock.mock.calls[0]!.arguments[1], ["admin"])
  const args = regenerateMock.mock.calls[0]!.arguments[0]
  assert.equal(args.versionId, 13607)
  assert.deepEqual(args.kinds, ["mba_pdf", "aa_media_plan"])
  assert.equal(args.force, false)
})
