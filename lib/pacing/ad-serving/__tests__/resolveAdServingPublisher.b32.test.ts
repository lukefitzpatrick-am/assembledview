/**
 * B32: the ad-serving resolver stamps `publisher` on a Channel Factory
 * Digital Video line only. Every other line maps byte-identical to 37bec7e1
 * (hash below produced by this input on 37bec7e1).
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const BURSTS = [
  { startDate: "2026-10-19T13:00:00.000Z", endDate: "2026-12-23T13:00:00.000Z", budget: "$30,000.00", buyAmount: "$0.07", calculatedValue: 428571 },
]
const master = {
  id: 1,
  mba_number: "PENFOLD020",
  mp_client_name: "Penfolds",
  mp_campaignname: "Troye Holiday FY27",
  version_number: 3,
  campaign_status: "approved",
  campaign_start_date: "2026-10-01",
  campaign_end_date: "2027-01-04",
  mp_campaignbudget: 0,
}
const versionRow = { id: 16999, version_number: 3, brand: null }

function line(endpoint: string, id: string, publisher: unknown, platform: unknown, buy = "cpv") {
  return {
    master,
    versionRow,
    endpoint,
    lineItem: {
      id: 7,
      line_item_id: id,
      line_item: 1,
      publisher,
      platform,
      buy_type: buy,
      budget_includes_fees: false,
      bursts_json: BURSTS,
    },
  }
}

const PLAIN = [
  line("media_plan_digi_video", "PENFOLD020DV1", "UMG Popsta", ""),
  line("media_plan_digi_video", "a1dv6", "UMG Popsta", "Channel Factory"),
  line("media_plan_digi_video", "a1dv4", "Vistar", ""),
  line("media_plan_digi_display", "a1dd1", "Channel Factory", "", "cpm"),
  line("media_plan_digi_audio", "a1da1", "", "", "cpm"),
  line("media_plan_digi_bvod", "a1bv1", null, "Seven", "cpm"),
]
const PARTNER = [
  line("media_plan_digi_video", "PENFOLD020DV2", "Channel Factory", ""),
  line("media_plan_digi_video", "trwico001dv1", "Channel Factory", "Channel Factory"),
  line("media_plan_digi_video", "a1dv2", "", "Channel Factory"),
]
let rows: unknown[] = PLAIN

/** 37bec7e1 `resolveLiveAdServingPacingCampaignRows` output for PLAIN. */
const PLAIN_PIN = "6541763e1443ba816cbdd954b89a56a7ec061fdfed0801cb7f2f6259b4ab2218"

if (supportsMockModule()) {
  await mock.module!("@/lib/pacing/plans/resolveLivePlanLineItems", {
    namedExports: {
      resolveLivePlanLineItems: async () => rows,
      fetchXanoLineItemsForMba: async () => [],
    },
  })
}

test("B32: lines without a Channel Factory publisher map byte-identical", { skip }, async () => {
  const { resolveLiveAdServingPacingCampaignRows } = await import("../resolveLiveAdServingLineItems.js")
  rows = PLAIN
  const out = await resolveLiveAdServingPacingCampaignRows({
    asOfDate: "2026-11-10",
    allowedClientSlugs: null,
    packageNoUnitTarget: false,
  })
  const hash = createHash("sha256").update(JSON.stringify(out)).digest("hex")
  assert.equal(hash, PLAIN_PIN)
  for (const row of out) assert.equal("publisher" in row, false, row.lineItemId)
})

test("B32: a Channel Factory Digital Video line carries its trimmed publisher", { skip }, async () => {
  const { resolveLiveAdServingPacingCampaignRows } = await import("../resolveLiveAdServingLineItems.js")
  rows = PARTNER
  const out = await resolveLiveAdServingPacingCampaignRows({
    asOfDate: "2026-11-10",
    allowedClientSlugs: null,
    packageNoUnitTarget: false,
  })
  assert.deepEqual(
    out.map((row) => [row.lineItemId, row.publisher]),
    [
      ["penfold020dv2", "Channel Factory"],
      ["trwico001dv1", "Channel Factory"],
      ["a1dv2", ""],
    ],
  )
  // Apart from `publisher`, the row is what 37bec7e1 built.
  for (const row of out) assert.equal(Object.keys(row).at(-1), "publisher")
})
