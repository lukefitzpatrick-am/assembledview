/** The pacing modal build passes the count-to day to every composer (P1). */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import { searchFixture } from "../../channel/__tests__/fixtures.js"

const skip = mockModuleSkip()

const composerArgs: Array<{ channel: string; args: Record<string, unknown> }> = []

const SEARCH_ROW = searchFixture({
  mbaNumber: "jayco001",
  campaignStartDate: "2026-10-01",
  campaignEndDate: "2026-10-31",
  lineItemStartDate: "2026-10-01",
  lineItemEndDate: "2026-10-31",
  bursts: [
    { index: 0, startDate: "2026-10-01", endDate: "2026-10-31", budget: 3_100, buyAmount: 3_100, calculatedValue: 0 },
  ],
  currentBurstIndex: 0,
  currentBurst: { index: 0, startDate: "2026-10-01", endDate: "2026-10-31", budget: 3_100, buyAmount: 3_100, calculatedValue: 0 },
  totalLineItemBudget: 3_100,
  spendToDateLineTotal: 2_100,
})

function composer(channel: string, rows: unknown[] = []) {
  return async (args: Record<string, unknown>) => {
    composerArgs.push({ channel, args })
    return rows
  }
}

/** A row stored before P1: no countToDate, counted to the view day. */
const OLD_SNAPSHOT_ROW = {
  mbaNumber: "jayco001",
  versionNumber: 1,
  clientName: "Jayco",
  clientSlug: "jayco",
  campaignName: "Jayco AU – Annual Plan",
  status: "booked",
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  daysElapsed: 22,
  daysTotal: 31,
  daysLeft: 9,
  timePct: 71,
  budget: 3_100,
  spendToDate: 2_100,
  expectedToDate: 2_200,
  spendPct: 95,
  pace: "on_track",
  projectedFinish: null,
  spendYesterday: 100,
  dailyRateActual: 95,
  dailyRatePlan: 100,
  kpi: null,
  moneyAtRisk: 100,
  why: "",
  channels: [],
}

if (supportsMockModule()) {
  await mock.module!("@/lib/cache/clientsCache", {
    namedExports: { getCachedClientsList: async () => ({ data: [] }) },
  })
  await mock.module!("@/lib/data/readMediaPlans", {
    namedExports: { readPlanVersionSchedulesByIds: async () => [] },
  })
  await mock.module!("@/lib/campaign-read/repo", {
    namedExports: { getLatestPublishedCampaignRead: async () => null },
  })
  await mock.module!("@/lib/pacing/campaigns/pacingRowsCache", {
    namedExports: { pacingScopeKey: () => "all" },
  })
  await mock.module!("@/lib/pacing/campaigns/fetchSearchPacingCampaignRows", {
    namedExports: { fetchSearchPacingCampaignRows: composer("search", [SEARCH_ROW]) },
  })
  await mock.module!("@/lib/pacing/social/fetchSocialPacingCampaignRows", {
    namedExports: { fetchSocialPacingCampaignRows: composer("social") },
  })
  await mock.module!("@/lib/pacing/programmatic/fetchProgrammaticPacingCampaignRows", {
    namedExports: { fetchProgrammaticPacingCampaignRows: composer("programmatic") },
  })
  await mock.module!("@/lib/pacing/ad-serving/fetchAdServingPacingCampaignRows", {
    namedExports: { fetchAdServingPacingCampaignRows: composer("adServing") },
  })
  await mock.module!("@/lib/pacing/direct/fetchDirectPacingRows", {
    namedExports: { fetchDirectPacingRows: composer("direct") },
  })
  await mock.module!("@/lib/spend/loadAssumedExpectedLines", {
    namedExports: { loadAssumedExpectedLinesByVersion: async () => new Map() },
  })
  await mock.module!("@/lib/delivery/readMbaFeeSnapshots", {
    namedExports: { loadDirectDigitalFeePctsOrGross: async () => ({}) },
  })
  await mock.module!("@/lib/pacing/portfolio/buildCampaignPacingRows", {
    namedExports: {
      schedulesByMbaFromVersions: () => new Map(),
    },
  })
  await mock.module!("@/lib/pacing/portfolio/portfolioSnapshotStore", {
    namedExports: {
      readPortfolioSnapshot: async () => ({
        asOfDate: "2026-10-22",
        scopeKey: "all",
        liveOnly: true,
        rows: [OLD_SNAPSHOT_ROW],
        counts: { live: 1, behind: 0, on_track: 1, ahead: 0, over_pacing: 0, attention: 0 },
        generatedAt: "2026-10-21T21:00:00.000Z",
        durationMs: 1,
      }),
    },
  })
  await mock.module!("@/lib/snowflake/pacing-service", {
    namedExports: { getCampaignPacingData: async () => [] },
  })
  await mock.module!("@/lib/snowflake/search-campaigns-pacing", {
    namedExports: { getSearchCampaignsPacingData: async () => [] },
  })
  await mock.module!("@/lib/pacing/detail/notes", {
    namedExports: { listCampaignDetailNotes: async () => [] },
  })
}

test("modal composers count to the day before the view day", { skip }, async () => {
  const { buildCampaignDetail } = await import("../buildCampaignDetail.js")
  composerArgs.length = 0
  const payload = await buildCampaignDetail({
    mbaNumber: "jayco001",
    asOfDate: "2026-10-22",
    allowedClientSlugs: null,
  })
  assert.equal(composerArgs.length, 5)
  for (const call of composerArgs) {
    assert.equal(call.args.asOfDate, "2026-10-22", call.channel)
    assert.equal(call.args.countToDate, "2026-10-21", call.channel)
  }
  assert.equal(payload.countTo, "2026-10-21")
  // The pre-P1 snapshot row is ignored; the fresh row is counted to 21 Oct.
  assert.equal(payload.row.countToDate, "2026-10-21")
  assert.equal(payload.row.daysElapsed, 21)
  assert.equal(payload.lines[0]?.lineItemId, "jayco001se1")
})
