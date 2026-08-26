import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  isWriteSessionExpired,
  resetWriteSessionExpiryForTests,
} from "@/lib/auth/writeSessionExpiry"
import { postPlansSave } from "@/lib/mediaplan/buildPostgresSavePayload"

afterEach(() => {
  resetWriteSessionExpiryForTests()
})

const MINIMAL_BODY = {
  masterId: 1,
  mbaNumber: "test001",
  mode: "draft" as const,
  versionNumber: 1,
  campaign: {
    campaignName: "Test",
    campaignStatus: "draft" as const,
    campaignStartDate: "2026-01-01",
    campaignEndDate: "2026-02-01",
    campaignBudgetCents: 100,
    clientId: null,
  },
  channelFlags: {},
  lineItems: [],
}

describe("postPlansSave session expiry", () => {
  it("a mocked 401 notes expiry and returns status 401 without inventing a save", async () => {
    const orig = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "unauthorised" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch
    try {
      const result = await postPlansSave(MINIMAL_BODY as never)
      assert.equal(result.ok, false)
      if (result.ok) throw new Error("expected failure")
      assert.equal(result.status, 401)
      assert.equal(isWriteSessionExpired(), true)
    } finally {
      globalThis.fetch = orig
    }
  })

  it("a subsequent successful write clears the banner flag", async () => {
    const orig = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      if (calls === 1) {
        return new Response(JSON.stringify({ error: "unauthorised" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      }
      return new Response(
        JSON.stringify({
          versionId: 9,
          lineCount: 0,
          scheduleRowCount: 0,
          published: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }) as typeof fetch
    try {
      await postPlansSave(MINIMAL_BODY as never)
      assert.equal(isWriteSessionExpired(), true)
      const ok = await postPlansSave(MINIMAL_BODY as never)
      assert.equal(ok.ok, true)
      assert.equal(isWriteSessionExpired(), false)
    } finally {
      globalThis.fetch = orig
    }
  })
})
