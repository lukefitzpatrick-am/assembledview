import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import {
  feeSnapshotHasRates,
  sumLegacyBillingTotals,
} from "@/lib/docs/legacyBillingTotals"

const here = dirname(fileURLToPath(import.meta.url))

function dumpBilling(name: string): unknown {
  const dump = JSON.parse(
    readFileSync(join(here, "fixtures", name), "utf8"),
  ) as {
    version: { legacySchedules?: { billingSchedule?: unknown } }
    expectedBlobTotals: { fee: number; adserving: number }
  }
  return dump.version.legacySchedules?.billingSchedule
}

describe("sumLegacyBillingTotals", () => {
  it("sums golf002 v28 billing blob to the Xano service fee", () => {
    const totals = sumLegacyBillingTotals(dumpBilling("golf002-v28.plan.json"))
    assert.equal(totals.fee, 15_028)
    assert.equal(totals.adserving, 0)
  })

  it("sums BICAU001 v14 billing blob fee and adserving", () => {
    const totals = sumLegacyBillingTotals(dumpBilling("bicau001-v14.plan.json"))
    assert.equal(totals.fee, 9_852.55)
    assert.equal(totals.adserving, 3_180.66)
  })
})

describe("feeSnapshotHasRates", () => {
  it("is false for an empty snapshot and true for glenda-shaped rates", () => {
    assert.equal(feeSnapshotHasRates({}), false)
    assert.equal(feeSnapshotHasRates(null), false)
    assert.equal(feeSnapshotHasRates({ feesocial: 20 }), true)
    assert.equal(feeSnapshotHasRates({ feesocial: "20" }), true)
    assert.equal(feeSnapshotHasRates({ feesocial: 0 }), false)
  })
})
