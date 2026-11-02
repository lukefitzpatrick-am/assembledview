/**
 * Golden tests for Phase-1 gate-review disposition ETL fixes (T1) that touch
 * live code: `explodeScheduleToMonthRows` (used by `savePlan` and
 * `publishBillingRevision`).
 * The `_lineItemTransform` cases went with the ETL tail to
 * `docs/archive/xano/migration/` in B18 (D8).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { explodeScheduleToMonthRows } from "../_scheduleTransform"

describe("empty {} delivery blob is no-delivery, not a parse failure", () => {
  it("treats {} as empty (curatif002 / malay001 shape)", () => {
    const result = explodeScheduleToMonthRows(60, "delivery", {})
    assert.equal(result.failureReason, null)
    assert.equal(result.rows.length, 0)
  })

  it("treats { months: [] } as empty", () => {
    const result = explodeScheduleToMonthRows(60, "delivery", { months: [] })
    assert.equal(result.failureReason, null)
    assert.equal(result.rows.length, 0)
  })
})
