/**
 * M1 R10: buildCampaignDetail hands its `one_net_media` value to the line
 * cards. A fee-inclusive search line at 10.50 and 7% is the cent-edge pair.
 * The flight ended in September, so the fresh build has no live row and the
 * detail serves the stored row: the line card keeps its own expected net
 * (a live row would rescale it to the channel expected).
 * R11: production callers leave both flags unset, so the detail reads them
 * once from `readDeliveryFlags` (mocked here to return both on).
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import { searchFixture } from "../../channel/__tests__/fixtures.js"
import { lineExpectedNetToDate } from "../netBurstMediaForPacing.js"

const skip = mockModuleSkip()

const BURST = { index: 0, startDate: "2026-09-01", endDate: "2026-09-30", budget: 10.5, buyAmount: 1, calculatedValue: 10 }

const SEARCH_ROW = searchFixture({
  mbaNumber: "jayco001",
  campaignStartDate: "2026-09-01",
  campaignEndDate: "2026-09-30",
  lineItemStartDate: "2026-09-01",
  lineItemEndDate: "2026-09-30",
  bursts: [BURST],
  currentBurstIndex: 0,
  currentBurst: BURST,
  budgetIncludesFees: true,
  totalLineItemBudget: 10.5,
  spendToDateLineTotal: 5,
})

// A package line: with `packageNoUnitTarget` on its bursts plan no deliverables.
const PACKAGE_ROW = searchFixture({
  mbaNumber: "jayco001",
  lineItemId: "jayco001se2",
  buyType: "package",
  campaignStartDate: "2026-09-01",
  campaignEndDate: "2026-09-30",
  lineItemStartDate: "2026-09-01",
  lineItemEndDate: "2026-09-30",
})

function composer(rows: unknown[] = []) {
  return async () => rows
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
  countToDate: "2026-10-21",
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
  await mock.module!("@/lib/delivery/deliveryFlags.server", {
    namedExports: {
      readDeliveryFlags: async () => ({
        packageNoUnitTarget: true,
        fixedCostReportNet: true,
        fixedCostFromDate: false,
        oneNetMedia: true,
      }),
    },
  })
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
    namedExports: { fetchSearchPacingCampaignRows: composer([SEARCH_ROW, PACKAGE_ROW]) },
  })
  await mock.module!("@/lib/pacing/social/fetchSocialPacingCampaignRows", {
    namedExports: { fetchSocialPacingCampaignRows: composer() },
  })
  await mock.module!("@/lib/pacing/programmatic/fetchProgrammaticPacingCampaignRows", {
    namedExports: { fetchProgrammaticPacingCampaignRows: composer() },
  })
  await mock.module!("@/lib/pacing/ad-serving/fetchAdServingPacingCampaignRows", {
    namedExports: { fetchAdServingPacingCampaignRows: composer() },
  })
  await mock.module!("@/lib/pacing/direct/fetchDirectPacingRows", {
    namedExports: { fetchDirectPacingRows: composer() },
  })
  await mock.module!("@/lib/spend/loadAssumedExpectedLines", {
    namedExports: { loadAssumedExpectedLinesByVersion: async () => new Map() },
  })
  await mock.module!("@/lib/delivery/readMbaFeeSnapshots", {
    namedExports: {
      loadDirectDigitalFeePctsOrGross: async () => ({
        "1": { "digital-display": 0, "digital-video": 0, "digital-audio": 0, bvod: 0, search: 7 },
      }),
    },
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

async function detail(flags: { oneNetMedia?: boolean; packageNoUnitTarget?: boolean }) {
  const { buildCampaignDetail } = await import("../buildCampaignDetail.js")
  return buildCampaignDetail({
    mbaNumber: "jayco001",
    asOfDate: "2026-10-22",
    allowedClientSlugs: null,
    ...flags,
  })
}

/** The search card's expected net, built with the switch passed in. */
async function cardExpected(oneNetMedia: boolean): Promise<number | null | undefined> {
  const payload = await detail({ oneNetMedia, packageNoUnitTarget: false })
  return payload.lines.find((line) => line.lineItemId === "jayco001se1")?.expectedToDate
}

type Detail = Awaited<ReturnType<typeof detail>>
const cent = (payload: Detail) => payload.lines.find((line) => line.lineItemId === "jayco001se1")?.expectedToDate
const bursts = (payload: Detail) => JSON.stringify(payload.bursts)

test("the campaign detail line card follows its one_net_media value", { skip }, async () => {
  const helper = (oneNetMedia: boolean) =>
    lineExpectedNetToDate({
      bursts: [BURST],
      budgetIncludesFees: true,
      feePct: 7,
      lineBudget: 10.5,
      lineStart: "2026-09-01",
      lineEnd: "2026-09-30",
      asOf: "2026-10-21",
      lineItemId: "jayco001se1",
      oneNetMedia,
    })
  assert.notEqual(helper(true), helper(false))
  assert.equal(await cardExpected(true), helper(true))
  assert.equal(await cardExpected(false), helper(false))
})

test("with both flags unset the detail reads them once: one net media and the package rule", { skip }, async () => {
  const unset = await detail({})
  const packageOn = await detail({ oneNetMedia: true, packageNoUnitTarget: true })
  const packageOff = await detail({ oneNetMedia: true, packageNoUnitTarget: false })
  assert.notEqual(bursts(packageOn), bursts(packageOff))
  assert.equal(cent(unset), 9.765)
  assert.equal(bursts(unset), bursts(packageOn))
})

test("a flag left unset is read even when the other is passed", { skip }, async () => {
  const packageOn = await detail({ oneNetMedia: true, packageNoUnitTarget: true })
  // oneNetMedia passed off, package unset: the package rule still comes from the read.
  const onlyNet = await detail({ oneNetMedia: false })
  assert.equal(cent(onlyNet), 9.764999999999999)
  assert.equal(bursts(onlyNet), bursts(packageOn))
  // package passed off, oneNetMedia unset: the switch still comes from the read.
  const onlyPackage = await detail({ packageNoUnitTarget: false })
  assert.equal(cent(onlyPackage), 9.765)
})
