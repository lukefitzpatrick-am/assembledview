/**
 * M1 R10: buildCampaignPacingRows hands its `one_net_media` value to assemble.
 * $6,422,837.50 at 42.84% is the one pair found where the direct digital
 * estimate moves a cent through `toCents`.
 * R11: production callers leave `oneNetMedia` unset, so the build reads it
 * from `readDeliveryFlags` (mocked here to return it on). The portfolio build
 * reads no package flag.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import { p6AssembleInput } from "./p6Fixture.js"

const skip = mockModuleSkip()

const input = p6AssembleInput()
const base = input.adServing[0]!
const adServing = [
  {
    ...base,
    lineItemId: "BICAU002BV9",
    budgetIncludesFees: true,
    bursts: [{ budget: "$6,422,837.50", calculatedValue: 1000 }] as never,
    impressions: 2000,
    plannedImpressions: 1000,
    deliverableTarget: 1000,
  },
]
const sources = { ...input, adServing }

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
  await mock.module!("@/lib/pacing/campaigns/pacingRowsCache", {
    namedExports: {
      pacingScopeKey: () => "all",
      getCachedSearchPacingRows: async () => sources.search,
      getCachedSocialPacingRows: async () => sources.social,
      getCachedProgrammaticPacingRows: async () => sources.programmatic,
      getCachedAdServingPacingRows: async () => sources.adServing,
      getCachedDirectPacingRows: async () => sources.direct,
    },
  })
  await mock.module!("@/lib/data/readMediaPlans", {
    namedExports: { readPublishedOrLivePlanVersions: async () => [] },
  })
  await mock.module!("@/lib/pacing/campaigns/fetchSearchPacingCampaignRows", {
    namedExports: { fetchSearchPacingCampaignRows: async () => sources.search },
  })
  await mock.module!("@/lib/pacing/social/fetchSocialPacingCampaignRows", {
    namedExports: { fetchSocialPacingCampaignRows: async () => sources.social },
  })
  await mock.module!("@/lib/pacing/programmatic/fetchProgrammaticPacingCampaignRows", {
    namedExports: { fetchProgrammaticPacingCampaignRows: async () => sources.programmatic },
  })
  await mock.module!("@/lib/pacing/ad-serving/fetchAdServingPacingCampaignRows", {
    namedExports: { fetchAdServingPacingCampaignRows: async () => sources.adServing },
  })
  await mock.module!("@/lib/pacing/direct/fetchDirectPacingRows", {
    namedExports: { fetchDirectPacingRows: async () => sources.direct },
  })
}

async function spendToDate(oneNetMedia?: boolean): Promise<number> {
  const { buildCampaignPacingRows } = await import("../buildCampaignPacingRows.js")
  const { rows } = await buildCampaignPacingRows({
    asOfDate: input.asOfDate,
    allowedClientSlugs: null,
    loadFeePcts: async () => ({
      [String(base.mediaPlanVersionId)]: { "digital-display": 0, "digital-video": 0, "digital-audio": 0, bvod: 42.84 },
    }),
    ...(oneNetMedia === undefined ? {} : { oneNetMedia }),
  })
  return rows.find((row) => row.mbaNumber === "BICAU002")!.spendToDate
}

test("the portfolio build passes its one_net_media value to assemble", { skip }, async () => {
  assert.equal(Math.round(((await spendToDate(true)) - (await spendToDate(false))) * 100), 1)
})

test("with the switch unset the portfolio build reads it from the delivery flags", { skip }, async () => {
  const unset = await spendToDate()
  assert.equal(unset, await spendToDate(true))
  assert.notEqual(unset, await spendToDate(false))
})
