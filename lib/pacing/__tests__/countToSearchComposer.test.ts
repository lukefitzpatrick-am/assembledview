import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

/** Campaign 20 to 29 Oct, $1,000. Two days of $100 by 21 Oct. */
const MASTERS = [
  {
    id: 1,
    mba_number: "P1TEST001",
    mp_client_name: "Acme",
    mp_campaignname: "Ten day flight",
    version_number: 2,
    campaign_status: "booked",
    campaign_start_date: "2026-10-20",
    campaign_end_date: "2026-10-29",
    mp_campaignbudget: 1000,
  },
  {
    id: 2,
    mba_number: "P1TEST002",
    mp_client_name: "Acme",
    mp_campaignname: "Starts on the view day",
    version_number: 1,
    campaign_status: "booked",
    campaign_start_date: "2026-10-22",
    campaign_end_date: "2026-10-31",
    mp_campaignbudget: 1000,
  },
]

const searchCalls: Array<{ startDate: string; endDate: string }> = []

if (supportsMockModule()) {
  await mock.module!("@/lib/data/readMediaPlans", {
    namedExports: {
      readPlanMasters: async () => MASTERS,
      readPlanVersionsForMbas: async () => [
        { id: 11, mba_number: "P1TEST001", version_number: 2, brand: null },
        { id: 12, mba_number: "P1TEST002", version_number: 1, brand: null },
      ],
      fetchLineItemsFromPostgresByEndpoint: async (_endpoint: string, mba: string) =>
        mba === "P1TEST001"
          ? [
              {
                id: 1,
                line_item_id: "p1test001se1",
                bursts_json: [{ start_date: "2026-10-20", end_date: "2026-10-29", budget: 1000 }],
              },
            ]
          : [
              {
                id: 2,
                line_item_id: "p1test002se1",
                bursts_json: [{ start_date: "2026-10-22", end_date: "2026-10-31", budget: 1000 }],
              },
            ],
    },
  })
  await mock.module!("@/lib/data/readPacing", {
    namedExports: { readPacingMasters: async () => [], readPacingVersions: async () => [] },
  })
  await mock.module!("@/lib/xano/campaignKpi", {
    namedExports: { fetchCampaignKpisForMbas: async () => [] },
  })
  await mock.module!("@/lib/snowflake/search-campaigns-pacing", {
    namedExports: {
      getSearchCampaignsPacingData: async (args: { startDate: string; endDate: string }) => {
        searchCalls.push({ startDate: args.startDate, endDate: args.endDate })
        return ["2026-10-20", "2026-10-21"].map((day) => ({
          LINE_ITEM_ID: "p1test001se1",
          CAMPAIGN_ID: "c1",
          CAMPAIGN_NAME: "Brand",
          PLATFORM_LINE_ITEM_ID: "ag1",
          LINE_ITEM_NAME: "Brand",
          DATE_DAY: day,
          AMOUNT_SPENT: 100,
          IMPRESSIONS: 1000,
          CLICKS: 10,
          CONVERSIONS: 1,
          REVENUE: 50,
        }))
      },
    },
  })
}

test("search composer counts to the count-to day and keeps liveness on the view day", { skip }, async () => {
  const { fetchSearchPacingCampaignRows } = await import("../campaigns/fetchSearchPacingCampaignRows.js")
  searchCalls.length = 0
  const rows = await fetchSearchPacingCampaignRows({
    asOfDate: "2026-10-22",
    countToDate: "2026-10-21",
    allowedClientSlugs: null,
  })
  assert.equal(searchCalls.at(-1)?.endDate, "2026-10-21")
  const flight = rows.find((r) => r.lineItemId === "p1test001se1")
  assert.ok(flight)
  assert.equal(flight.spendToDateLineTotal, 200)
  // Two of ten days counted at $100 a day projects to budget: on track.
  assert.equal(flight.lineItemStatus, "on-track")
  // Starts on the view day: still listed, nothing counted, not started.
  const starting = rows.find((r) => r.lineItemId === "p1test002se1")
  assert.ok(starting)
  assert.equal(starting.lineItemStatus, "no-data")
})

test("search composer without a count-to day keeps the old as-of", { skip }, async () => {
  const { fetchSearchPacingCampaignRows } = await import("../campaigns/fetchSearchPacingCampaignRows.js")
  searchCalls.length = 0
  const rows = await fetchSearchPacingCampaignRows({ asOfDate: "2026-10-22", allowedClientSlugs: null })
  assert.equal(searchCalls.at(-1)?.endDate, "2026-10-22")
  const flight = rows.find((r) => r.lineItemId === "p1test001se1")
  // Three days elapsed with two days of spend reads behind.
  assert.equal(flight?.lineItemStatus, "behind")
})
