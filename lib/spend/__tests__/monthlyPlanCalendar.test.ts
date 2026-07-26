/**
 * expectedSpendToDateFromDeliveryScheduleMonthly (via monthlySpendArrayFromDeliverySchedule) must
 * understand BOTH deliverySchedule shapes — 'types' (mediaTypes[].lineItems) and 'costs'
 * (mediaCosts{channelKey}) — via the shared normaliser, so 'costs'-shape media isn't silently
 * dropped (previously only fees counted).
 */
import { describe, expect, it } from "vitest"

import {
  monthlySpendArrayFromDeliverySchedule,
  expectedSpendToDateFromDeliveryScheduleMonthly,
} from "../monthlyPlanCalendar"

describe("monthlySpendArrayFromDeliverySchedule", () => {
  it("counts 'costs'-shape mediaCosts media (regression: was previously invisible)", () => {
    const deliverySchedule = [
      {
        month: "August 2025",
        mediaCosts: { television: "$2,000.00", bvod: "$500.00" },
        mediaTotal: "$2,500.00",
        feeTotal: "$300.00",
        totalAmount: "$2,800.00",
      },
    ]

    const rows = monthlySpendArrayFromDeliverySchedule(deliverySchedule)
    expect(rows).toHaveLength(1)
    const [row] = rows
    const byType = Object.fromEntries(row.data.map((d) => [d.mediaType, d.amount]))
    expect(byType.Television).toBeCloseTo(2000, 2)
    expect(byType.BVOD).toBeCloseTo(500, 2)
    expect(byType.Fees).toBeCloseTo(300, 2)

    const rowTotal = row.data.reduce((sum, d) => sum + d.amount, 0)
    expect(rowTotal).toBeCloseTo(2800, 2)
  })

  it("still counts 'types'-shape media the same as before (no regression)", () => {
    const deliverySchedule = [
      {
        month: "August 2025",
        mediaTypes: [{ mediaType: "Radio", lineItems: [{ amount: "$1,000.00" }] }],
      },
    ]

    const rows = monthlySpendArrayFromDeliverySchedule(deliverySchedule)
    expect(rows).toHaveLength(1)
    const byType = Object.fromEntries(rows[0].data.map((d) => [d.mediaType, d.amount]))
    expect(byType.Radio).toBeCloseTo(1000, 2)
  })

  it("does not double-count mediaCosts.production against the top-level production fee", () => {
    const deliverySchedule = [
      {
        month: "August 2025",
        mediaCosts: { television: "$500.00", production: "$100.00" },
        mediaTotal: "$500.00",
        feeTotal: "$0.00",
        production: "$100.00",
        totalAmount: "$600.00",
      },
    ]

    const rows = monthlySpendArrayFromDeliverySchedule(deliverySchedule)
    const rowTotal = rows[0].data.reduce((sum, d) => sum + d.amount, 0)
    expect(rowTotal).toBeCloseTo(600, 2) // 500 media + 100 production (once) — not 700
  })
})

describe("expectedSpendToDateFromDeliveryScheduleMonthly", () => {
  it("includes 'costs'-shape media for a fully-elapsed campaign month", () => {
    const deliverySchedule = [
      {
        month: "January 2020",
        mediaCosts: { television: "$1,000.00" },
        mediaTotal: "$1,000.00",
        feeTotal: "$0.00",
        totalAmount: "$1,000.00",
      },
    ]

    const expected = expectedSpendToDateFromDeliveryScheduleMonthly(deliverySchedule, {
      campaignStartISO: "2020-01-01",
      campaignEndISO: "2020-01-31",
    })
    expect(expected).toBeCloseTo(1000, 2)
  })
})
