/**
 * S1 A (B54): a schedule ingest accept with mode "publish" goes through
 * savePlanVersion's publish validation; its refusal comes back as a 422 that
 * lists each problem, not a 500.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { SavePlanError } from "../../../../../../lib/data/savePlan"
import { publishRefusalBody } from "../../../../../../lib/mediaplan/publishValidation"
import { mockModuleSkip, supportsMockModule } from "../../../../../../lib/test/mockModuleHarness"

const skip = mockModuleSkip()

const body = publishRefusalBody([
  { rule: "no_publisher", channel: "ooh", lineItemId: "test001OH1", burst: null, message: "Line test001OH1 has no publisher." },
])

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: { requireAdmin: async () => ({ session: { user: { email: "planner@example.com" } } }) },
  })
  await mock.module!("@/lib/mediaplans/ingest/executeIngestAccept", {
    namedExports: {
      executeIngestAcceptWithCampaign: async () => {
        throw new SavePlanError("PUBLISH_VALIDATION_REFUSED", body.error, undefined, { ...body })
      },
    },
  })
}

test("ingest accept: a publish refused by the validation set is 422 with the problems", { skip }, async () => {
  const { POST } = await import("../route.js")
  const res = await POST(
    new NextRequest("http://localhost/api/admin/ingest/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposal: { lines: [] }, masterId: 1, mbaNumber: "test001", mode: "publish" }),
    }),
  )
  assert.equal(res.status, 422)
  const json = (await res.json()) as { code?: string; lineItemIds?: string[]; publishProblems?: unknown[] }
  assert.equal(json.code, "PUBLISH_VALIDATION_REFUSED")
  assert.deepEqual(json.lineItemIds, ["test001OH1"])
  assert.equal(json.publishProblems?.length, 1)
})
