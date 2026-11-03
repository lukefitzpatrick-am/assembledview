/**
 * B23fix (B23 review finding 4, Luke 3 Nov 2026): the hub Delivered double
 * count fix sits on its own switch, `hub_delivered_dedupe`, default off and
 * independent of the fixed-cost switches. On: the Direct leg leaves out
 * social and search lines the snapshot already counts. Off: as before, even
 * with both fixed-cost switches on.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { featureDefinition, type FeatureRow } from "../../features/registry.js"

const skip = mockModuleSkip()

// BICAU001SM1 shape: $100 platform spend in the snapshot, $80 reported on the Direct leg.
const snapshot = {
  asOf: "2026-11-02",
  planTotals: { spendToDate: 100, impressions: 1000, clicks: 10, results: 0, video3sViews: 0 },
  channels: [{ group: "social_meta", lines: [{ lineItemId: "bicau001sm1", spendToDate: 100, impressions: 1000, clicks: 10 }] }],
}
const directGroups = [
  {
    mbaNumber: "BICAU001",
    totalReported: 80,
    lineItems: [{ lineItemId: "bicau001sm1", totalReported: 80, totalActual: 100, daily: [] }],
  },
]

if (supportsMockModule()) {
  await mock.module!("@/lib/delivery/loadDeliverySnapshot", {
    namedExports: { loadDeliverySnapshot: async () => snapshot },
  })
  await mock.module!("@/lib/pacing/direct/fetchDirectPacingRows", {
    namedExports: { fetchDirectPacingRows: async () => directGroups },
  })
  await mock.module!("@/lib/pacing/maths", {
    namedExports: { getAsOfDate: () => "2026-11-02" },
  })
}

function rows(on: string[]): Map<string, FeatureRow> {
  return new Map(
    on.map((key) => [key, { key, enabled: true, updatedAt: null, updatedBy: null, updatedByName: null, note: null }]),
  )
}

test("registry: own switch, default off, server only, no requires", () => {
  const def = featureDefinition("hub_delivered_dedupe")!
  assert.ok(def)
  assert.equal(def.defaultOn, false)
  assert.equal(def.clientVisible, false)
  assert.equal(def.source, "switch")
  assert.equal("requires" in def ? def.requires : undefined, undefined)
  assert.match(def.description, /Independent of the fixed-cost switches/)
})

test("readHubDeliveredDedupe: reads only its own key; a failed read is off", async () => {
  const { readHubDeliveredDedupe } = await import("../deliveryFlags.server.js")
  assert.equal(await readHubDeliveredDedupe(async (key) => key === "hub_delivered_dedupe"), true)
  assert.equal(
    await readHubDeliveredDedupe(async (key) => key === "fixed_cost_from_date" || key === "fixed_cost_report_net"),
    false,
  )
  assert.equal(
    await readHubDeliveredDedupe(async () => {
      throw new Error("db down")
    }),
    false,
  )
})

test("campaign strip Delivered: counted twice off (even with both fixed-cost switches), once on", { skip }, async () => {
  const { setFeatureRowReaderForTests } = await import("../../features/server.js")
  const { getDeliveredTotalsForCampaign } = await import("../getDeliveredTotalsForCampaign.js")
  const run = async (on: string[]) => {
    setFeatureRowReaderForTests(async () => rows(on))
    return getDeliveredTotalsForCampaign({
      mbaNumber: "BICAU001",
      lineItemsMap: { television: [{ line_item_id: "bicau001tv1" }], socialMedia: [{ line_item_id: "bicau001sm1" }] },
    })
  }
  try {
    const off = await run([])
    assert.equal(off.spendToDate, 180)
    const fixedCostOnly = await run(["fixed_cost_from_date", "fixed_cost_report_net"])
    assert.deepEqual(fixedCostOnly, off, "the fixed-cost switches no longer move the hub figure")
    const on = await run(["hub_delivered_dedupe"])
    assert.equal(on.spendToDate, 100)
  } finally {
    setFeatureRowReaderForTests(null)
  }
})

test("client totals use the same switch (text check)", async () => {
  const { readFileSync } = await import("node:fs")
  const { join } = await import("node:path")
  for (const f of ["getDeliveredTotalsForClient.ts", "getDeliveredTotalsForCampaign.ts"]) {
    const src = readFileSync(join(process.cwd(), "lib/delivery", f), "utf8")
    assert.match(src, /excludePlatformSocialAndSearch: hubDeliveredDedupe,/, f)
    assert.doesNotMatch(src, /excludePlatformSocialAndSearch: deliveryFlags\.fixedCostFromDate/, f)
  }
})
