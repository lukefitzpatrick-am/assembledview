import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

if (supportsMockModule()) {
  await mock.module!("@/lib/pacing/campaigns/fetchSearchPacingCampaignRows", {
    namedExports: {
      fetchAllMasters: async () => [
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
      ],
      fetchCurrentVersionRowsForMasters: async () => new Map(),
    },
  })
  await mock.module!("@/lib/snowflake/query", {
    namedExports: {
      querySnowflake: async (_sql: string, _binds: unknown[], opts: { label: string }) => {
        if (opts.label === "fixed_cost_line_item_fact") {
          return [
            {
              LINE_ITEM_ID: "p1test001tv1",
              MBA_NUMBER: "P1TEST001",
              LINE_ITEM_NAME: "TV",
              IS_CURRENTLY_FIXED_COST: true,
              WAS_EVER_FIXED_COST: true,
              LINE_ITEM_TOTAL_BUDGET: 1000,
              LINE_ITEM_TOTAL_REPORTED: 300,
              LINE_ITEM_TOTAL_ACTUAL: 300,
              LINE_ITEM_VARIANCE: 0,
              BURST_COUNT: 1,
              BURSTS_DELIVERED_OVER: 0,
              BURSTS_DELIVERED_UNDER: 0,
              BUY_TYPE: "fixed_cost",
            },
          ]
        }
        if (opts.label === "fixed_cost_burst_fact") {
          return [
            {
              LINE_ITEM_ID: "p1test001tv1",
              BURST_INDEX: 0,
              BURST_START_DATE: "2026-10-20",
              BURST_END_DATE: "2026-10-29",
              BURST_BUDGET: 1000,
              BURST_EXPECTED_DELIVERABLES: 0,
              BURST_ACTUAL_DELIVERABLES: 0,
              BURST_DELIVERY_RATIO: 0,
              BURST_REPORTED_SPEND: 300,
              BURST_ACTUAL_PLATFORM_SPEND: 300,
              BURST_VARIANCE: 0,
              BURST_STATUS: "in_progress",
            },
          ]
        }
        return ["2026-10-20", "2026-10-21", "2026-10-22"].map((day) => ({
          LINE_ITEM_ID: "p1test001tv1",
          BURST_INDEX: 0,
          DATE_DAY: day,
          REPORTED_SPEND: 100,
          ACTUAL_PLATFORM_SPEND: 100,
          ACTUAL_DELIVERABLES: 0,
          EXPECTED_DAILY_DELIVERABLES: 0,
          IS_SQUAREUP_DAY: false,
          IS_LOCKED: false,
          BUY_TYPE: "fixed_cost",
          CAP_APPLIED: "",
        }))
      },
    },
  })
}

test("direct composer stops line and campaign totals at the count-to day", { skip }, async () => {
  const { fetchDirectPacingRows } = await import("../direct/fetchDirectPacingRows.js")
  const [group] = await fetchDirectPacingRows({
    asOfDate: "2026-10-22",
    countToDate: "2026-10-21",
    allowedClientSlugs: null,
    includeHistorical: false,
  })
  assert.equal(group?.lineItems[0]?.totalReported, 200)
  assert.equal(group?.lineItems[0]?.bursts[0]?.reportedSpend, 200)
  assert.equal(group?.totalReported, 200)
  assert.equal(group?.totalActual, 200)

  const [old] = await fetchDirectPacingRows({
    asOfDate: "2026-10-22",
    allowedClientSlugs: null,
    includeHistorical: false,
  })
  assert.equal(old?.totalReported, 300)
})
