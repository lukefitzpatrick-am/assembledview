/**
 * S15: the AA pack cron needs the cron secret. Requires Node 22+ module mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../../../lib/test/mockModuleHarness.js"

const skip = mockModuleSkip()
const runMock = mock.fn(async () => ({ skipped: "switch off" as const }))

if (supportsMockModule()) {
  await mock.module!("@/lib/finance/billingPartner/packJob", {
    namedExports: { runBillingPartnerPackJob: runMock },
  })
}

test("no secret is 401 and the job does not run", { skip }, async () => {
  process.env.CRON_SECRET = "s15-secret"
  runMock.mock.resetCalls()
  const { GET } = await import("../route.js")
  const res = await GET(new Request("http://localhost/api/cron/billing-partner-pack"))
  assert.equal(res.status, 401)
  assert.equal(runMock.mock.calls.length, 0)
})

test("the secret runs the job and returns its result", { skip }, async () => {
  process.env.CRON_SECRET = "s15-secret"
  runMock.mock.resetCalls()
  const { GET } = await import("../route.js")
  const res = await GET(
    new Request("http://localhost/api/cron/billing-partner-pack", {
      headers: { authorization: "Bearer s15-secret" },
    }),
  )
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { skipped: "switch off" })
  assert.equal(runMock.mock.calls.length, 1)
})
