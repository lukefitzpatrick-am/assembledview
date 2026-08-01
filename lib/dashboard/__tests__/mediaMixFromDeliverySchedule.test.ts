import { describe, expect, it } from "vitest"

import {
  MEDIA_MIX_DONUT_BASIS_CAPTION,
  channelTotalsFromDeliverySchedule,
  mediaMixTotalFromDeliverySchedule,
  monthlyMixFromDeliverySchedule,
} from "../mediaMixFromDeliverySchedule"
import {
  expectedSpendToDateFromDeliveryScheduleMonthly,
  totalPlannedSpendFromDeliveryScheduleMonthly,
} from "@/lib/spend/monthlyPlanCalendar"

describe("MEDIA_MIX_DONUT_BASIS_CAPTION", () => {
  it("names the delivery-schedule planned-media basis (AV-4 pattern)", () => {
    expect(MEDIA_MIX_DONUT_BASIS_CAPTION).toBe("delivery schedule · planned media")
  })
})

describe("mediaMixFromDeliverySchedule", () => {
  const schedule = [
    {
      month: "January 2020",
      mediaCosts: { television: "$1,000.00", search: "$500.00" },
      mediaTotal: "$1,500.00",
      feeTotal: "$150.00",
      totalAmount: "$1,650.00",
    },
    {
      month: "February 2020",
      mediaCosts: { television: "$800.00" },
      mediaTotal: "$800.00",
      feeTotal: "$0.00",
      totalAmount: "$800.00",
    },
  ]

  it("aggregates channel slices across months", () => {
    const byChannel = Object.fromEntries(
      channelTotalsFromDeliverySchedule(schedule).map((r) => [r.channel, r.spend]),
    )
    expect(byChannel.Television).toBeCloseTo(1800, 2)
    expect(byChannel.Search).toBeCloseTo(500, 2)
    expect(byChannel.Fees).toBeCloseTo(150, 2)
  })

  it("donut total reconciles with total planned from the same delivery schedule", () => {
    const mixTotal = mediaMixTotalFromDeliverySchedule(schedule)
    const plannedTotal = totalPlannedSpendFromDeliveryScheduleMonthly(schedule)
    expect(mixTotal).toBeCloseTo(plannedTotal, 2)
    expect(mixTotal).toBeCloseTo(2450, 2)
  })

  it("Expected Spend to date uses the same schedule family (full-elapsed months)", () => {
    // January + February 2020 are fully in the past → expected = full planned.
    const expected = expectedSpendToDateFromDeliveryScheduleMonthly(schedule)
    const mixTotal = mediaMixTotalFromDeliverySchedule(schedule)
    expect(expected).toBeCloseTo(mixTotal, 2)
  })

  it("monthly mix rows share the same month totals as the donut", () => {
    const monthly = monthlyMixFromDeliverySchedule(schedule)
    const fromMonths = monthly.reduce((sum, row) => {
      return (
        sum +
        Object.entries(row)
          .filter(([k]) => k !== "month")
          .reduce((s, [, v]) => s + (Number(v) || 0), 0)
      )
    }, 0)
    expect(fromMonths).toBeCloseTo(mediaMixTotalFromDeliverySchedule(schedule), 2)
  })
})
