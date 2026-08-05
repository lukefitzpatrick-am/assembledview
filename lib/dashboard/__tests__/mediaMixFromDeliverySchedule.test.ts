import { describe, expect, it } from "vitest"

import {
  MEDIA_MIX_DONUT_BASIS_CAPTION,
  channelTotalsFromDeliverySchedule,
  isNonMediaMixSlice,
  mediaMixTotalFromDeliverySchedule,
  monthlyMixFromDeliverySchedule,
} from "../mediaMixFromDeliverySchedule"
import {
  expectedSpendToDateFromDeliveryScheduleMonthly,
  totalPlannedSpendFromDeliveryScheduleMonthly,
} from "@/lib/spend/monthlyPlanCalendar"
import { buildShareBreakdownRows } from "@/lib/charts/shareBreakdown"

describe("MEDIA_MIX_DONUT_BASIS_CAPTION", () => {
  it("names the delivery-schedule planned-media basis (AV-4 pattern)", () => {
    expect(MEDIA_MIX_DONUT_BASIS_CAPTION).toBe("delivery schedule · planned media")
  })
})

describe("isNonMediaMixSlice", () => {
  it("matches the Fees bucket only (case/trim insensitive)", () => {
    expect(isNonMediaMixSlice("Fees")).toBe(true)
    expect(isNonMediaMixSlice(" fees ")).toBe(true)
    expect(isNonMediaMixSlice("FEES")).toBe(true)
    expect(isNonMediaMixSlice("Search")).toBe(false)
    expect(isNonMediaMixSlice("Production")).toBe(false)
    expect(isNonMediaMixSlice("")).toBe(false)
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

  it("display filter: media+fees → fee excluded; shares 100% over media; centre = media only", () => {
    const all = channelTotalsFromDeliverySchedule(schedule)
    expect(all.some((r) => r.channel === "Fees")).toBe(true)
    const media = all.filter((r) => !isNonMediaMixSlice(r.channel))
    expect(media.some((r) => isNonMediaMixSlice(r.channel))).toBe(false)
    const mediaTotal = media.reduce((s, r) => s + r.spend, 0)
    expect(mediaTotal).toBeCloseTo(2300, 2)
    expect(mediaMixTotalFromDeliverySchedule(schedule)).toBeCloseTo(2450, 2)

    const legend = buildShareBreakdownRows(
      media.map((r) => ({ label: r.channel, value: r.spend, color: "c" })),
      mediaTotal,
    )!
    const shareSum = Math.round(legend.reduce((s, r) => s + r.sharePct, 0) * 10) / 10
    expect(shareSum).toBe(100)
  })

  it("display filter: fees-only schedule → no media slices (empty donut path)", () => {
    const feesOnly = [
      {
        month: "March 2020",
        mediaCosts: {},
        mediaTotal: "$0.00",
        feeTotal: "$400.00",
        totalAmount: "$400.00",
      },
    ]
    const all = channelTotalsFromDeliverySchedule(feesOnly)
    expect(all).toEqual([{ channel: "Fees", spend: 400 }])
    const media = all.filter((r) => !isNonMediaMixSlice(r.channel) && r.spend > 0)
    expect(media).toEqual([])
  })

  it("display filter: no fees → media list byte-identical to channel totals", () => {
    const noFees = [
      {
        month: "April 2020",
        mediaCosts: { search: "$200.00", newspaper: "$100.00" },
        mediaTotal: "$300.00",
        feeTotal: "$0.00",
        totalAmount: "$300.00",
      },
    ]
    const all = channelTotalsFromDeliverySchedule(noFees)
    const media = all.filter((r) => !isNonMediaMixSlice(r.channel))
    expect(media).toEqual(all)
    expect(all.some((r) => r.channel === "Fees")).toBe(false)
  })
})
