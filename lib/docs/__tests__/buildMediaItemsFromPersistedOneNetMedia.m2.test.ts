/**
 * M2 (C-417): the published workbook build reads `one_net_media` through
 * `readDeliveryFlags` and passes it to the explode. Fixture: 1,050 at 7%
 * (the version's fee snapshot), CPC $1, a 976.5 click rounding edge.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

let oneNetMedia = true
/** Each awaited select returns the next queued rows: fee snapshot, approved slice, overrides, schedule months. */
let queue: unknown[][] = []
const next = async () => queue.shift() ?? []
const chain: Record<string, unknown> = {
  select: () => chain,
  from: () => chain,
  where: () => chain,
  limit: next,
  then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => next().then(resolve, reject),
}

if (typeof mock.module === "function") {
  await mock.module("@/lib/data/readMbaPlanDetail", {
    namedExports: {
      readMbaPlanDetailFromPostgres: async () => ({
        ok: true,
        data: {
          id: 7001,
          published_at: "2026-02-01T00:00:00Z",
          campaign_start_date: "2026-03-01",
          campaign_end_date: "2026-03-31",
          lineItems: {
            search: [{
              line_item_id: "X1",
              buy_type: "cpc",
              budget_includes_fees: true,
              platform: "Google",
              bursts: [{ startDate: "2026-03-01", endDate: "2026-03-20", budget: 1050, buyAmount: 1 }],
            }],
          },
        },
      }),
    },
  })
  await mock.module("@/lib/data/readPublishers", { namedExports: { fetchPublishersFromPostgres: async () => [] } })
  await mock.module("@/db", { namedExports: { getDb: () => chain, schema: new Proxy({}, { get: () => ({}) }) } })
  await mock.module("@/lib/features/server", { namedExports: { isFeatureOn: async () => false } })
  await mock.module("@/lib/delivery/deliveryFlags.server", {
    namedExports: {
      readDeliveryFlags: async () => ({ packageNoUnitTarget: false, fixedCostReportNet: false, fixedCostFromDate: false, oneNetMedia }),
    },
  })
}

const { buildMediaItemsFromPersisted } = await import("../buildMediaItemsFromPersisted.js")

test("the published build hands the switch read to the explode, on and off", { skip }, async () => {
  for (const [value, count] of [[true, 977], [false, 976]] as const) {
    oneNetMedia = value
    queue = [[{ fees: { feesearch: 7 } }], [{ approvedSlice: null }], [], []]
    const built = await buildMediaItemsFromPersisted({ mbaNumber: "m2edge001", versionNumber: 1 })
    assert.deepEqual(built.mediaItems.search.map((row) => row.deliverables), [count], String(value))
  }
})
