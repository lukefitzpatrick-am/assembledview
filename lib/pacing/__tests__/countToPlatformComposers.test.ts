import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const BURST = {
  index: 0,
  startDate: "2026-10-20",
  endDate: "2026-10-29",
  budget: 1000,
  buyAmount: 10,
  calculatedValue: 100000,
}

function planRow(lineItemId: string, extra: Record<string, unknown>) {
  return {
    mbaNumber: "P1TEST001",
    mediaPlanVersionId: 11,
    mediaPlanVersionNumber: 2,
    lineItemId,
    clientName: "Acme",
    campaignName: "Ten day flight",
    campaignStatus: "booked",
    campaignStartDate: "2026-10-20",
    campaignEndDate: "2026-10-29",
    platform: "meta",
    buyType: "cpm",
    lineItemStartDate: "2026-10-20",
    lineItemEndDate: "2026-10-29",
    totalLineItemBudget: 1000,
    totalBursts: 1,
    bursts: [BURST],
    currentBurstIndex: 0,
    currentBurst: BURST,
    burstDaysRemaining: 8,
    deliverableMetric: "IMPRESSIONS",
    deliverableTarget: 100000,
    lineItemStatus: "no-data",
    platformCampaigns: [],
    kpiTargets: null,
    ...extra,
  }
}

const factCalls: Array<{ channel: string; endDate: string }> = []

if (supportsMockModule()) {
  await mock.module!("@/lib/pacing/social/resolveLiveSocialLineItems", {
    namedExports: {
      resolveLiveSocialPacingCampaignRows: async () => [
        planRow("p1test001sm1", {
          socialPlatform: "meta",
          kpiPlanLine: {
            buyType: "cpv",
            plannedSpend: 1000,
            buyAmount: 0.05,
            plannedViews: null,
            plannedImpressions: null,
          },
        }),
      ],
    },
  })
  await mock.module!("@/lib/pacing/programmatic/resolveLiveProgrammaticLineItems", {
    namedExports: {
      resolveLiveProgrammaticPacingCampaignRows: async () => [
        planRow("p1test001pd1", {
          snowflakeChannel: "programmatic-display",
          channelFamily: "progDisplay",
          platform: "dv360",
          platformLabel: "DV360",
        }),
      ],
      deriveProgrammaticPlatformLabel: () => "DV360",
    },
  })
  await mock.module!("@/lib/pacing/ad-serving/resolveLiveAdServingLineItems", {
    namedExports: {
      resolveLiveAdServingPacingCampaignRows: async () => [
        planRow("p1test001dd1", {
          channelFamily: "digitalDisplay",
          platform: "cm360",
          deliverableKind: "impressions",
        }),
      ],
    },
  })
  await mock.module!("@/lib/xano/campaignKpi", {
    namedExports: {
      // A leftover saved CPV that the KPI cells must ignore (C2).
      fetchCampaignKpisForMbas: async () => [
        {
          id: 1,
          created_at: 0,
          mp_client_name: "Acme",
          mba_number: "P1TEST001",
          version_number: 2,
          campaign_name: "Ten day flight",
          media_type: "socialMedia",
          publisher: "meta",
          bid_strategy: "",
          ctr: null,
          cpv: 0.1,
          conversion_rate: null,
          vtr: null,
          frequency: null,
          line_item_id: "p1test001sm1",
        },
      ],
    },
  })
  await mock.module!("@/lib/snowflake/pacing-fact", {
    namedExports: {
      queryPacingFact: async (params: { channel: string; lineItemIds: string[]; endDate: string }) => {
        factCalls.push({ channel: params.channel, endDate: params.endDate })
        if (params.lineItemIds.length === 0) return []
        return ["2026-10-20", "2026-10-21"].map((day) => ({
          LINE_ITEM_ID: params.lineItemIds[0],
          DATE_DAY: day,
          CAMPAIGN_NAME: "Brand",
          ENTITY_ID: "e1",
          ENTITY_NAME: "Brand",
          AMOUNT_SPENT: 100,
          IMPRESSIONS: 10000,
          CLICKS: 10,
          RESULTS: 0,
          VIDEO_3S_VIEWS: 0,
        }))
      },
    },
  })
}

test("social composer counts facts and status to the count-to day", { skip }, async () => {
  const { fetchSocialPacingCampaignRows } = await import("../social/fetchSocialPacingCampaignRows.js")
  factCalls.length = 0
  const [row] = await fetchSocialPacingCampaignRows({
    asOfDate: "2026-10-22",
    countToDate: "2026-10-21",
    allowedClientSlugs: null,
  })
  assert.ok(factCalls.length > 0)
  assert.ok(factCalls.every((c) => c.endDate === "2026-10-21"))
  assert.equal(row?.spendToDateLineTotal, 200)
  assert.equal(row?.lineItemStatus, "on-track")
  // Spend yesterday is the count-to day.
  assert.equal(row?.spendYesterday, 100)
  // C2: the plan CPV rate, not the saved 0.10.
  assert.equal(row?.kpiTargets?.cpv, 0.1)
  assert.equal(row?.planCpvRate, 0.05)

  factCalls.length = 0
  const [old] = await fetchSocialPacingCampaignRows({ asOfDate: "2026-10-22", allowedClientSlugs: null })
  assert.ok(factCalls.every((c) => c.endDate === "2026-10-22"))
  assert.equal(old?.lineItemStatus, "behind")
})

test("programmatic composer counts facts and status to the count-to day", { skip }, async () => {
  const { fetchProgrammaticPacingCampaignRows } = await import(
    "../programmatic/fetchProgrammaticPacingCampaignRows.js"
  )
  factCalls.length = 0
  const [row] = await fetchProgrammaticPacingCampaignRows({
    asOfDate: "2026-10-22",
    countToDate: "2026-10-21",
    allowedClientSlugs: null,
  })
  assert.ok(factCalls.length > 0)
  assert.ok(factCalls.every((c) => c.endDate === "2026-10-21"))
  assert.equal(row?.spendToDateLineTotal, 200)
  assert.equal(row?.lineItemStatus, "on-track")
})

test("ad-serving composer counts facts to the count-to day", { skip }, async () => {
  const { fetchAdServingPacingCampaignRows } = await import(
    "../ad-serving/fetchAdServingPacingCampaignRows.js"
  )
  factCalls.length = 0
  const [row] = await fetchAdServingPacingCampaignRows({
    asOfDate: "2026-10-22",
    countToDate: "2026-10-21",
    allowedClientSlugs: null,
  })
  assert.deepEqual(
    factCalls.map((c) => c.endDate),
    ["2026-10-21"],
  )
  assert.equal(row?.impressions, 20000)
})
