/**
 * Header feeTotal lands on __service__fees when a month has lines but no
 * per-line fee row. A per-line fee still suppresses the synthetic.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { explodeScheduleToMonthRows } from "../_scheduleTransform"

describe("explodeScheduleToMonthRows __service__fees", () => {
  it("month with lines and per-line fees writes no service row", () => {
    const result = explodeScheduleToMonthRows(1, "billing", [
      {
        monthYear: "2026-07",
        mediaTotal: "$5,000.00",
        feeTotal: "$1,000.00",
        lineItems: {
          television: [
            {
              id: "candel001TV1",
              monthlyAmounts: { "2026-07": 5000 },
              feeMonthlyAmounts: { "2026-07": 1000 },
            },
          ],
        },
      },
    ])

    assert.equal(result.failureReason, null)
    const fees = result.rows.filter((r) => r.component === "fee")
    assert.equal(fees.length, 1)
    assert.equal(fees[0]?.lineItemId, "candel001TV1")
    assert.equal(fees[0]?.amountCents, 100000)
    assert.equal(
      result.rows.some((r) => r.lineItemId === "__service__fees"),
      false,
    )
  })

  it("month with lines, no per-line fee, and header fee 1000 writes one service row of 100000 cents", () => {
    const result = explodeScheduleToMonthRows(1, "billing", [
      {
        monthYear: "2026-07",
        mediaTotal: "$5,000.00",
        feeTotal: 1000,
        lineItems: {
          television: [
            {
              id: "candel001TV1",
              monthlyAmounts: { "2026-07": 5000 },
            },
            {
              id: "candel001RD1",
              monthlyAmounts: { "2026-07": 0 },
            },
          ],
        },
      },
    ])

    assert.equal(result.failureReason, null)
    const service = result.rows.filter((r) => r.lineItemId === "__service__fees")
    assert.equal(service.length, 1)
    assert.equal(service[0]?.component, "fee")
    assert.equal(service[0]?.basis, "billing")
    assert.equal(service[0]?.month, "2026-07-01")
    assert.equal(service[0]?.amountCents, 100000)
    assert.equal(service[0]?.source, "computed")
    assert.equal(
      result.rows.some(
        (r) => r.component === "fee" && r.lineItemId !== "__service__fees",
      ),
      false,
    )
    assert.equal(
      result.rows.some(
        (r) => r.lineItemId === "candel001TV1" && r.component === "media",
      ),
      true,
    )
  })

  it("month with no lines still writes __service__fees and no media-total row at zero", () => {
    const result = explodeScheduleToMonthRows(1, "billing", [
      {
        monthYear: "2026-07",
        mediaTotal: "$0.00",
        feeTotal: "$1,000.00",
        lineItems: {},
      },
    ])

    assert.equal(result.failureReason, null)
    const service = result.rows.filter((r) => r.lineItemId === "__service__fees")
    assert.equal(service.length, 1)
    assert.equal(service[0]?.amountCents, 100000)
    assert.equal(
      result.rows.some((r) => r.lineItemId === "__service__media_total"),
      false,
    )
  })
})
