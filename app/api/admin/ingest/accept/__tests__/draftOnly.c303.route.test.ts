/**
 * C-303 (B54fix): POST /api/admin/ingest/accept saves a draft only. Any other
 * mode ("publish", "new_version") is a 400 with a plain message, before the
 * save runs. The Hub sends "draft"; a body with no mode is a draft.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../../lib/test/mockModuleHarness"

const skip = mockModuleSkip()

const acceptMock = mock.fn(async (_input: { campaign: { mode: string } }) => ({ ok: true as const, versionId: 1 }))

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: { requireAdmin: async () => ({ session: { user: { email: "planner@example.com" } } }) },
  })
  await mock.module!("@/lib/mediaplans/ingest/executeIngestAccept", {
    namedExports: { executeIngestAcceptWithCampaign: acceptMock },
  })
}

async function accept(mode: unknown) {
  acceptMock.mock.resetCalls()
  const { POST } = await import("../route.js")
  return POST(
    new NextRequest("http://localhost/api/admin/ingest/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposal: { lines: [] }, masterId: 1, mbaNumber: "test001", ...(mode === undefined ? {} : { mode }) }),
    }),
  )
}

for (const mode of ["publish", "new_version", "PUBLISH", ""]) {
  test(`mode ${JSON.stringify(mode)} is 400 and nothing is saved`, { skip }, async () => {
    const res = await accept(mode)
    assert.equal(res.status, 400)
    assert.match(((await res.json()) as { error: string }).error, /draft only/)
    assert.equal(acceptMock.mock.calls.length, 0)
  })
}

for (const mode of ["draft", undefined]) {
  test(`mode ${String(mode)} saves a draft`, { skip }, async () => {
    const res = await accept(mode)
    assert.equal(res.status, 200)
    assert.equal(acceptMock.mock.calls.length, 1)
    assert.equal(acceptMock.mock.calls[0]!.arguments[0].campaign.mode, "draft")
  })
}
