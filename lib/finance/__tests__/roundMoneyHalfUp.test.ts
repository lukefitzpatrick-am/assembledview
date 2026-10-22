/**
 * C3a (Luke, 22 Oct 2026): finance and billing helpers round money once,
 * half-up away from zero, through lib/money `roundMoney2`.
 * The old `Math.round(x * 100) / 100` turned 1.005 into 1.00.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  collectPersistedFeeBillingMismatchIssues,
  sumBillingScheduleFeeTotal,
} from "@/lib/billing/assertPersistedLineFeesMatchBilling"
import type { BillingMonth } from "@/lib/billing/types"
import { addReportMeasures, emptyReportMeasures } from "@/lib/finance/report/metrics"
import type { ReportRow } from "@/lib/finance/report/types"

function month(feeTotal: string): BillingMonth {
  return { monthYear: "October 2026", feeTotal } as unknown as BillingMonth
}

describe("C3a finance rounding is half-up through lib/money", () => {
  it("billing fee total rounds a half cent up, not down", () => {
    assert.equal(1.005 * 100, 100.49999999999999)
    assert.equal(Math.round(1.005 * 100) / 100, 1)
    assert.equal(sumBillingScheduleFeeTotal([month("1.005")]), 1.01)
    assert.equal(sumBillingScheduleFeeTotal([month("-1.005")]), -1.01)
    assert.equal(sumBillingScheduleFeeTotal([month("1.004")]), 1)
  })

  it("fee parity still holds when both sides round the same way", () => {
    const issues = collectPersistedFeeBillingMismatchIssues({
      months: [month("1.005")],
      lineItems: [],
    })
    // Billing 1.01 vs persisted 0 is a real mismatch; the guard still fires.
    assert.equal(issues.length, 1)
    assert.match(issues[0]!, /\$1\.01/)
    assert.deepEqual(collectPersistedFeeBillingMismatchIssues({ months: [], lineItems: [] }), [])
  })

  it("report measures accumulate with half-up cents", () => {
    const measures = emptyReportMeasures()
    addReportMeasures(measures, { totalBillable: 1.005, mediaSpend: 1.005, agencyFee: 0 } as ReportRow)
    assert.equal(measures.totalBillable, 1.01)
    assert.equal(measures.mediaSpend, 1.01)
    assert.equal(measures.rowCount, 1)
  })

  it("moves at most one cent against the old rounding", () => {
    const values = [0.005, 1.005, 2.675, 10.125, 1234.565, -0.005, -2.675, 99.995, 0.1 + 0.2]
    for (const v of values) {
      const before = Math.round(v * 100) / 100
      const measures = emptyReportMeasures()
      addReportMeasures(measures, { totalBillable: v, mediaSpend: 0, agencyFee: 0 } as ReportRow)
      assert.ok(Math.abs(measures.totalBillable - before) <= 0.01 + 1e-9, `${v}: ${before} -> ${measures.totalBillable}`)
    }
  })
})
