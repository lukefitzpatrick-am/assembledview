/**
 * M1: loadDeliverySnapshot passes its `one_net_media` read (DeliveryFlags)
 * to the direct digital estimate. The pair is the one real cent move found
 * in 30 million random budget and fee pairs: $6,422,837.50 at 42.84%.
 * R10: it passes the same read to each line's expected net (buildLines to
 * expectedNetForPlan to the report pace helper). 10.50 at 7% is the
 * cent-edge pair there.
 * n9: Ava, the campaign report and campaign read pass no flags, so the loader
 * reads them from `readDeliveryFlags` (mocked here to return the switch on).
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { classifySocialPacingPlatform } from "../../pacing/social/classifySocialPacingPlatform.js"

const skip = mockModuleSkip()

if (supportsMockModule()) {
  await mock.module!("@/lib/delivery/deliveryFlags.server", {
    namedExports: {
      readDeliveryFlags: async () => ({
        packageNoUnitTarget: false,
        fixedCostReportNet: false,
        fixedCostFromDate: false,
        oneNetMedia: true,
      }),
    },
  })
  await mock.module!("@/lib/snowflake/pacing-service", {
    namedExports: {
      getCampaignPacingData: async (_mba: string, ids: string[]) =>
        ids.includes("m1dd1")
          ? [
              {
                channel: "ad-serving",
                dateDay: "2026-10-05",
                lineItemId: "m1dd1",
                amountSpent: 0,
                impressions: 2000,
                clicks: 0,
                results: 0,
                video3sViews: 0,
              },
            ]
          : [],
    },
  })
  await mock.module!("@/lib/snowflake/search-pacing-service", {
    namedExports: { getSearchPacingData: async () => null },
  })
  await mock.module!("@/lib/pacing/direct/fetchDirectPacingRows", {
    namedExports: { queryDailyFacts: async () => [] },
  })
  await mock.module!("@/lib/pacing/social/resolveLiveSocialLineItems", {
    namedExports: { classifySocialPacingPlatform },
  })
}

const line = {
  line_item_id: "m1dd1",
  name: "Display",
  publisher: "Nine",
  buy_type: "cpm",
  budget_includes_fees: true,
  media_plan_version: 77,
  bursts: [
    {
      budget: "$6,422,837.50",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      buyAmount: "$10.00",
      calculatedValue: 1000,
    },
  ],
}

const centEdgeLine = {
  ...line,
  line_item_id: "m1dd2",
  media_plan_version: 78,
  bursts: [{ ...line.bursts[0], budget: "$10.50" }],
}

async function snapshotLine(oneNetMedia: boolean | undefined, id: string) {
  const { loadDeliverySnapshot } = await import("../loadDeliverySnapshot.js")
  const snap = await loadDeliverySnapshot({
    mbaNumber: "m1",
    versionNumber: 1,
    lineItemsByChannel: { digitalDisplay: [line, centEdgeLine] },
    feePctsByVersionId: {
      "77": { "digital-display": 42.84, "digital-video": 0, "digital-audio": 0, bvod: 0 },
      "78": { "digital-display": 7, "digital-video": 0, "digital-audio": 0, bvod: 0, digiDisplay: 7 },
    },
    ...(oneNetMedia === undefined
      ? {}
      : { deliveryFlags: { packageNoUnitTarget: false, fixedCostReportNet: false, fixedCostFromDate: false, oneNetMedia } }),
    startDate: "2026-10-01",
    endDate: "2026-10-31",
  })
  return snap.channels.flatMap((ch) => ch.lines).find((l) => l.lineItemId === id)
}

async function spend(oneNetMedia: boolean): Promise<unknown> {
  return (await snapshotLine(oneNetMedia, "m1dd1"))?.spendToDate
}

test("the snapshot's direct digital estimate follows its one_net_media flag", { skip }, async () => {
  assert.equal(await spend(true), 3671293.92)
  assert.equal(await spend(false), 3671293.91)
})

test("the snapshot's expected net follows its one_net_media flag", { skip }, async () => {
  assert.equal((await snapshotLine(true, "m1dd2"))?.expectedNetToDate, 9.765)
  assert.equal((await snapshotLine(false, "m1dd2"))?.expectedNetToDate, 9.764999999999999)
})

test("with no flags passed the snapshot reads the switch from the delivery flags", { skip }, async () => {
  assert.equal((await snapshotLine(undefined, "m1dd2"))?.expectedNetToDate, 9.765)
  assert.equal((await snapshotLine(undefined, "m1dd1"))?.spendToDate, 3671293.92)
})
