/**
 * Header production lands on __service__production only when no production
 * line carries media that month. Bare ids (PENFOLD020PROD1) count as lines.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { explodeScheduleToMonthRows } from "../_scheduleTransform"

describe("explodeScheduleToMonthRows __service__production", () => {
  it("bare production line id suppresses the header production row", () => {
    const result = explodeScheduleToMonthRows(1, "billing", [
      {
        monthYear: "November 2026",
        mediaTotal: "$1,000.00",
        feeTotal: "$0.00",
        production: "$7,028.43",
        lineItems: {
          ooh: [{ id: "PENFOLD020OH1", monthlyAmounts: { "November 2026": 1000 } }],
          production: [
            { id: "PENFOLD020PROD2", monthlyAmounts: { "November 2026": 1875 } },
            { id: "PENFOLD020PROD6", monthlyAmounts: { "November 2026": 5153.43 } },
          ],
        },
      },
    ])

    assert.equal(result.failureReason, null)
    assert.equal(
      result.rows.some((r) => r.lineItemId === "__service__production"),
      false,
    )
    const production = result.rows.filter((r) => r.lineItemId.includes("PROD"))
    assert.equal(
      production.reduce((sum, r) => sum + r.amountCents, 0),
      702843,
    )
  })

  it("header production with no production lines still writes the service row", () => {
    const result = explodeScheduleToMonthRows(1, "billing", [
      {
        monthYear: "November 2026",
        mediaTotal: "$1,000.00",
        feeTotal: "$0.00",
        production: "$500.00",
        lineItems: {
          ooh: [{ id: "PENFOLD020OH1", monthlyAmounts: { "November 2026": 1000 } }],
        },
      },
    ])

    assert.equal(result.failureReason, null)
    const service = result.rows.filter((r) => r.lineItemId === "__service__production")
    assert.equal(service.length, 1)
    assert.equal(service[0]?.amountCents, 50000)
  })

  it("a production line with no media this month leaves the header row", () => {
    const result = explodeScheduleToMonthRows(1, "billing", [
      {
        monthYear: "December 2026",
        mediaTotal: "$0.00",
        feeTotal: "$0.00",
        production: "$300.00",
        lineItems: {
          production: [{ id: "STRMEA001PROD1", monthlyAmounts: { "December 2026": 0 } }],
        },
      },
    ])

    assert.equal(result.failureReason, null)
    assert.equal(
      result.rows.filter((r) => r.lineItemId === "__service__production").length,
      1,
    )
  })
})
