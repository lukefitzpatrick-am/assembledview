/**
 * campaign_kpi bulk Postgres fetch must dedupe (mba, version) pairs
 * the same way fetchCampaignKpisForMbasFromXano does.
 * Requires Node 22+ `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import * as schema from "@/db/schema"
import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const kpiRow = {
  id: 1,
  mbaNumber: "BICAU002",
  versionNumber: 4,
  lineItemId: "bicau002se1",
}

const select = mock.fn(() => ({
  from: () => ({
    where: async () => [kpiRow],
  }),
}))

/** Each fetchCampaignKpisFromPostgres call hits getDb once. */
const getDb = mock.fn(() => ({ select }))

if (supportsMockModule()) {
  await mock.module!("@/db", {
    namedExports: {
      getDb,
      schema,
    },
  })
}

const readKpi = supportsMockModule() ? await import("../readKpi") : null

test(
  "fetchCampaignKpisForMbasFromPostgres dedupes identical mba/version pairs",
  { skip },
  async () => {
    assert.ok(readKpi)
    getDb.mock.resetCalls()
    select.mock.resetCalls()

    const pair = { mbaNumber: "BICAU002", versionNumber: 4 }
    const rows = await readKpi.fetchCampaignKpisForMbasFromPostgres([
      pair,
      pair,
      pair,
    ])

    assert.equal(
      getDb.mock.calls.length,
      1,
      "fetchCampaignKpisFromPostgres is called once"
    )
    assert.equal(select.mock.calls.length, 1)
    assert.equal(rows.length, 1)
  }
)
