/**
 * B32: the Ad Serving composer makes its one extra partner-file query only
 * when a Channel Factory Digital Video line is live, for those ids only.
 * A book without one makes exactly the 37bec7e1 query (ad-serving, all ids).
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

type Call = { channel: string; lineItemIds: string[]; startDate: string; endDate: string }
const calls: Call[] = []
let planRows: Array<Record<string, unknown>> = []
let failPartner = false

function plan(lineItemId: string, extra: Record<string, unknown> = {}) {
  return {
    mbaNumber: "B32TEST002",
    mediaPlanVersionId: 1,
    mediaPlanVersionNumber: 1,
    lineItemId,
    clientName: "Acme",
    campaignName: "Flight",
    campaignStatus: "booked",
    campaignStartDate: "2026-10-20",
    campaignEndDate: "2026-12-24",
    platform: "",
    buyType: "cpv",
    channelFamily: "digitalVideo",
    lineItemStartDate: "2026-10-20",
    lineItemEndDate: "2026-12-24",
    lineItemStatus: "no-data",
    impressions: 0,
    clicks: 0,
    ctr: null,
    videoCompletes: 0,
    results: 0,
    daysActive: 0,
    deliverableProgress: null,
    deliverableActual: 0,
    deliverableTarget: 1000,
    deliverableKind: "impressions",
    ...extra,
  }
}

if (supportsMockModule()) {
  await mock.module!("@/lib/pacing/ad-serving/resolveLiveAdServingLineItems", {
    namedExports: {
      resolveLiveAdServingPacingCampaignRows: async () => structuredClone(planRows),
    },
  })
  await mock.module!("@/lib/snowflake/pacing-fact", {
    namedExports: {
      queryPacingFact: async (params: Call) => {
        calls.push({ ...params, lineItemIds: [...params.lineItemIds] })
        if (params.channel === "programmatic-video" && failPartner) throw new Error("warehouse down")
        return params.lineItemIds.map((id) => ({
          CHANNEL: params.channel,
          LINE_ITEM_ID: id,
          DATE_DAY: "2026-10-21",
          IMPRESSIONS: params.channel === "ad-serving" ? 10 : 1000,
          CLICKS: 0,
          RESULTS: 0,
          VIDEO_3S_VIEWS: params.channel === "ad-serving" ? 0 : 700,
        }))
      },
    },
  })
}

test("B32: no Channel Factory line → one ad-serving query, rows unmarked", { skip }, async () => {
  const { fetchAdServingPacingCampaignRows } = await import("../fetchAdServingPacingCampaignRows.js")
  planRows = [plan("a1dv1", { platform: "Channel Factory" }), plan("a1dd1", { channelFamily: "digitalDisplay" })]
  calls.length = 0
  const rows = await fetchAdServingPacingCampaignRows({ asOfDate: "2026-11-10", countToDate: "2026-11-09", allowedClientSlugs: null })
  assert.deepEqual(calls.map((c) => c.channel), ["ad-serving"])
  assert.deepEqual(calls[0]!.lineItemIds, ["a1dv1", "a1dd1"])
  assert.equal(rows.length, 2)
  assert.ok(rows.every((row) => row.deliverySource === undefined && row.impressions === 10))
})

test("B32: a Channel Factory line → a programmatic-video query for its id only", { skip }, async () => {
  const { fetchAdServingPacingCampaignRows } = await import("../fetchAdServingPacingCampaignRows.js")
  planRows = [plan("TRWICO001DV1", { publisher: "Channel Factory", platform: "Channel Factory" }), plan("a1dd1", { channelFamily: "digitalDisplay" })]
  calls.length = 0
  const rows = await fetchAdServingPacingCampaignRows({ asOfDate: "2026-11-10", countToDate: "2026-11-09", allowedClientSlugs: null })
  assert.deepEqual(calls.map((c) => c.channel), ["ad-serving", "programmatic-video"])
  assert.deepEqual(calls[1]!.lineItemIds, ["trwico001dv1"])
  assert.equal(calls[1]!.startDate, "2026-10-20")
  assert.equal(calls[1]!.endDate, "2026-11-09")
  const cf = rows.find((row) => row.lineItemId === "TRWICO001DV1")
  assert.equal(cf?.deliverySource, "partner_file_and_cm360")
  assert.equal(cf?.impressions, 1010)
  assert.equal(cf?.videoCompletes, 700)
  assert.equal(rows.find((row) => row.lineItemId === "a1dd1")?.deliverySource, undefined)
})

test("B32: a failed partner query throws (an outage is not 'no delivery')", { skip }, async () => {
  const { fetchAdServingPacingCampaignRows } = await import("../fetchAdServingPacingCampaignRows.js")
  planRows = [plan("trwico001dv1", { publisher: "Channel Factory" })]
  failPartner = true
  const original = console.error
  console.error = () => {}
  try {
    await assert.rejects(
      fetchAdServingPacingCampaignRows({ asOfDate: "2026-11-10", countToDate: "2026-11-09", allowedClientSlugs: null }),
      /warehouse down/,
    )
  } finally {
    console.error = original
    failPartner = false
  }
})
