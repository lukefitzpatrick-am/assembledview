/** The portfolio build passes the count-to day to every channel read (P1). */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const cachedCalls: Array<{ channel: string; args: unknown[] }> = []
const freshCalls: Array<{ channel: string; args: Record<string, unknown> }> = []
let upserted: { rows: Array<{ countToDate?: string }> } | null = null

function cached(channel: string) {
  return async (...args: unknown[]) => {
    cachedCalls.push({ channel, args })
    return []
  }
}

function fresh(channel: string) {
  return async (args: Record<string, unknown>) => {
    freshCalls.push({ channel, args })
    return []
  }
}

if (supportsMockModule()) {
  await mock.module!("@/lib/pacing/campaigns/pacingRowsCache", {
    namedExports: {
      pacingScopeKey: (slugs: Set<string> | null) => (slugs == null ? "all" : "scoped"),
      getCachedSearchPacingRows: cached("search"),
      getCachedSocialPacingRows: cached("social"),
      getCachedProgrammaticPacingRows: cached("programmatic"),
      getCachedAdServingPacingRows: cached("adServing"),
      getCachedDirectPacingRows: cached("direct"),
    },
  })
  await mock.module!("@/lib/data/readMediaPlans", {
    namedExports: { readPublishedOrLivePlanVersions: async () => [] },
  })
  await mock.module!("@/lib/pacing/portfolio/portfolioSnapshotStore", {
    namedExports: {
      upsertPortfolioSnapshot: async (payload: {
        asOfDate: string
        scopeKey: string
        liveOnly: boolean
        rows: Array<{ countToDate?: string }>
        counts: unknown
        durationMs: number
      }) => {
        upserted = { rows: payload.rows }
        return { ...payload, generatedAt: "2026-10-22T00:00:00.000Z" }
      },
    },
  })
  await mock.module!("@/lib/pacing/campaigns/fetchSearchPacingCampaignRows", {
    namedExports: { fetchSearchPacingCampaignRows: fresh("search") },
  })
  await mock.module!("@/lib/pacing/social/fetchSocialPacingCampaignRows", {
    namedExports: { fetchSocialPacingCampaignRows: fresh("social") },
  })
  await mock.module!("@/lib/pacing/programmatic/fetchProgrammaticPacingCampaignRows", {
    namedExports: { fetchProgrammaticPacingCampaignRows: fresh("programmatic") },
  })
  await mock.module!("@/lib/pacing/ad-serving/fetchAdServingPacingCampaignRows", {
    namedExports: { fetchAdServingPacingCampaignRows: fresh("adServing") },
  })
  await mock.module!("@/lib/pacing/direct/fetchDirectPacingRows", {
    namedExports: { fetchDirectPacingRows: fresh("direct") },
  })
}

test("cached reads carry the count-to day", { skip }, async () => {
  const { buildAndStorePortfolioSnapshot } = await import("../buildAndStorePortfolioSnapshot.js")
  cachedCalls.length = 0
  await buildAndStorePortfolioSnapshot({
    asOfDate: "2026-10-22",
    countToDate: "2026-10-21",
    scopeKey: "all",
    liveOnly: true,
    allowedClientSlugs: null,
    loadFeePcts: async () => ({}),
  })
  assert.equal(cachedCalls.length, 5)
  for (const call of cachedCalls) {
    assert.equal(call.args[0], "2026-10-22", call.channel)
    assert.equal(call.args.at(-1), "2026-10-21", call.channel)
  }
  assert.ok(upserted)
})

test("the cron's uncached reads carry the count-to day", { skip }, async () => {
  const { buildAndStorePortfolioSnapshot } = await import("../buildAndStorePortfolioSnapshot.js")
  freshCalls.length = 0
  await buildAndStorePortfolioSnapshot({
    asOfDate: "2026-10-22",
    countToDate: "2026-10-21",
    scopeKey: "all",
    liveOnly: true,
    allowedClientSlugs: null,
    cache: false,
    loadFeePcts: async () => ({}),
  })
  assert.equal(freshCalls.length, 5)
  for (const call of freshCalls) {
    assert.equal(call.args.asOfDate, "2026-10-22", call.channel)
    assert.equal(call.args.countToDate, "2026-10-21", call.channel)
  }
})
