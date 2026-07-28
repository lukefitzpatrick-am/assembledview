/**
 * Plan C S2-P4a — perLine billingMonths from billing schedule, deliveryMonths from delivery.
 */
import { describe, expect, it } from "vitest"
import type { BillingMonth, BillingLineItem } from "@/lib/billing/types"
import { computeCampaignFinancialsFromVersion } from "@/lib/finance/computeCampaignFinancialsFromVersion"
import { roundMoney2 } from "@/lib/format/money"

function emptyMediaCosts(): BillingMonth["mediaCosts"] {
  return {
    search: "$0.00",
    socialMedia: "$0.00",
    television: "$0.00",
    radio: "$0.00",
    newspaper: "$0.00",
    magazines: "$0.00",
    ooh: "$0.00",
    cinema: "$0.00",
    digiDisplay: "$0.00",
    digiAudio: "$0.00",
    digiVideo: "$0.00",
    bvod: "$0.00",
    integration: "$0.00",
    progDisplay: "$0.00",
    progVideo: "$0.00",
    progBvod: "$0.00",
    progAudio: "$0.00",
    progOoh: "$0.00",
    influencers: "$0.00",
    production: "$0.00",
  }
}

function line(
  partial: Omit<Partial<BillingLineItem>, "id" | "monthlyAmounts" | "totalAmount"> & {
    id: string
    monthlyAmounts: Record<string, number>
    totalAmount: number
  }
): BillingLineItem {
  return {
    header1: "",
    header2: "",
    ...partial,
  }
}

function monthShell(
  monthYear: string,
  opts: {
    mediaTotal: string
    feeTotal: string
    totalAmount: string
    mediaCostKey?: string
    mediaCost?: string
    lineItems: NonNullable<BillingMonth["lineItems"]>
  }
): BillingMonth {
  const mediaCosts = emptyMediaCosts()
  if (opts.mediaCostKey && opts.mediaCost) {
    ;(mediaCosts as Record<string, string>)[opts.mediaCostKey] = opts.mediaCost
  }
  return {
    monthYear,
    mediaTotal: opts.mediaTotal,
    feeTotal: opts.feeTotal,
    totalAmount: opts.totalAmount,
    adservingTechFees: "$0.00",
    production: "$0.00",
    mediaCosts,
    lineItems: opts.lineItems,
  }
}

function sumMonths(
  months: Array<{ month: string; amount: number }>
): number {
  return roundMoney2(months.reduce((s, m) => s + m.amount, 0))
}

describe("perLineFromSchedules (blob hydrate)", () => {
  it("(a) client-pays: billingMonths sum 0, deliveryMonths sum full; media stays delivery", () => {
    const delivery: BillingMonth[] = [
      monthShell("May 2026", {
        mediaTotal: "$8,000.00",
        feeTotal: "$2,000.00",
        totalAmount: "$10,000.00",
        mediaCostKey: "progDisplay",
        mediaCost: "$8,000.00",
        lineItems: {
          progDisplay: [
            line({
              id: "CP1",
              monthlyAmounts: { "May 2026": 8000 },
              feeMonthlyAmounts: { "May 2026": 2000 },
              totalAmount: 8000,
              totalFeeAmount: 2000,
              clientPaysForMedia: true,
            }),
          ],
        },
      }),
    ]
    const billing: BillingMonth[] = [
      monthShell("May 2026", {
        mediaTotal: "$0.00",
        feeTotal: "$2,000.00",
        totalAmount: "$2,000.00",
        lineItems: {
          progDisplay: [
            line({
              id: "CP1",
              monthlyAmounts: { "May 2026": 0 },
              feeMonthlyAmounts: { "May 2026": 2000 },
              totalAmount: 0,
              totalFeeAmount: 2000,
              clientPaysForMedia: true,
            }),
          ],
        },
      }),
    ]

    const result = computeCampaignFinancialsFromVersion({
      billingSchedule: billing,
      deliverySchedule: delivery,
    })
    expect(result).not.toBeNull()
    const pl = result!.perLine.find((p) => p.lineItemId === "CP1")!
    expect(sumMonths(pl.billingMonths)).toBe(0)
    expect(sumMonths(pl.deliveryMonths)).toBe(8000)
    expect(pl.media).toBe(8000)
    expect(pl.flags.clientPaysForMedia).toBe(true)
    expect(result!.mbaScopeTotals.grossMedia).toBe(8000)
    expect(result!.validation.billableEqualsMba).toBe(true)
  })

  it("(b) manual billing timing: same total, different months per side", () => {
    const delivery: BillingMonth[] = [
      monthShell("May 2026", {
        mediaTotal: "$5,000.00",
        feeTotal: "$0.00",
        totalAmount: "$5,000.00",
        mediaCostKey: "search",
        mediaCost: "$5,000.00",
        lineItems: {
          search: [
            line({
              id: "MAN1",
              monthlyAmounts: { "May 2026": 5000 },
              feeMonthlyAmounts: { "May 2026": 0 },
              totalAmount: 5000,
              billingMode: "auto",
            }),
          ],
        },
      }),
    ]
    const billing: BillingMonth[] = [
      monthShell("June 2026", {
        mediaTotal: "$5,000.00",
        feeTotal: "$0.00",
        totalAmount: "$5,000.00",
        mediaCostKey: "search",
        mediaCost: "$5,000.00",
        lineItems: {
          search: [
            line({
              id: "MAN1",
              monthlyAmounts: { "June 2026": 5000 },
              feeMonthlyAmounts: { "June 2026": 0 },
              totalAmount: 5000,
              billingMode: "manual",
            }),
          ],
        },
      }),
    ]

    const result = computeCampaignFinancialsFromVersion({
      billingSchedule: billing,
      deliverySchedule: delivery,
    })
    expect(result).not.toBeNull()
    const pl = result!.perLine.find((p) => p.lineItemId === "MAN1")!
    expect(sumMonths(pl.deliveryMonths)).toBe(5000)
    expect(sumMonths(pl.billingMonths)).toBe(5000)
    expect(pl.deliveryMonths.map((m) => m.month)).toEqual(["May 2026"])
    expect(pl.billingMonths.map((m) => m.month)).toEqual(["June 2026"])
    expect(pl.media).toBe(5000)
    expect(pl.flags.manualBilling).toBe(true)
  })

  it("(c) line present in billing only and delivery only — both get perLine entries", () => {
    const delivery: BillingMonth[] = [
      monthShell("May 2026", {
        mediaTotal: "$1,000.00",
        feeTotal: "$0.00",
        totalAmount: "$1,000.00",
        mediaCostKey: "search",
        mediaCost: "$1,000.00",
        lineItems: {
          search: [
            line({
              id: "DEL-ONLY",
              monthlyAmounts: { "May 2026": 1000 },
              totalAmount: 1000,
            }),
          ],
        },
      }),
    ]
    const billing: BillingMonth[] = [
      monthShell("May 2026", {
        mediaTotal: "$2,000.00",
        feeTotal: "$100.00",
        totalAmount: "$2,100.00",
        mediaCostKey: "socialMedia",
        mediaCost: "$2,000.00",
        lineItems: {
          socialMedia: [
            line({
              id: "auto-socialMedia-May 2026",
              monthlyAmounts: { "May 2026": 2000 },
              feeMonthlyAmounts: { "May 2026": 100 },
              totalAmount: 2000,
              totalFeeAmount: 100,
            }),
          ],
        },
      }),
    ]

    const result = computeCampaignFinancialsFromVersion({
      billingSchedule: billing,
      deliverySchedule: delivery,
    })
    expect(result).not.toBeNull()
    const delOnly = result!.perLine.find((p) => p.lineItemId === "DEL-ONLY")!
    const billOnly = result!.perLine.find(
      (p) => p.lineItemId === "auto-socialMedia-May 2026"
    )!
    expect(delOnly).toBeDefined()
    expect(billOnly).toBeDefined()
    expect(delOnly.billingMonths).toEqual([])
    expect(sumMonths(delOnly.deliveryMonths)).toBe(1000)
    expect(delOnly.media).toBe(1000)
    expect(billOnly.deliveryMonths).toEqual([])
    expect(sumMonths(billOnly.billingMonths)).toBe(2000)
    expect(billOnly.media).toBe(0)
    expect(billOnly.fee).toBe(100)
  })

  it("(d) regression: mbaScopeTotals and billableMbaExGst unchanged when billing == delivery", () => {
    const shared: BillingMonth[] = [
      monthShell("May 2026", {
        mediaTotal: "$4,000.00",
        feeTotal: "$1,000.00",
        totalAmount: "$5,000.00",
        mediaCostKey: "search",
        mediaCost: "$4,000.00",
        lineItems: {
          search: [
            line({
              id: "EQ1",
              monthlyAmounts: { "May 2026": 4000 },
              feeMonthlyAmounts: { "May 2026": 1000 },
              totalAmount: 4000,
              totalFeeAmount: 1000,
            }),
          ],
        },
      }),
    ]
    const result = computeCampaignFinancialsFromVersion({
      billingSchedule: shared,
      deliverySchedule: shared,
    })
    expect(result).not.toBeNull()
    expect(result!.mbaScopeTotals.grossMedia).toBe(4000)
    expect(result!.mbaScopeTotals.fee).toBe(1000)
    expect(result!.mbaScopeTotals.nettExGst).toBe(5000)

    const clientPaysMedia = result!.perLine
      .filter((p) => p.flags.clientPaysForMedia)
      .reduce((s, p) => s + p.media, 0)
    expect(clientPaysMedia).toBe(0)

    const billableMbaExGst = roundMoney2(
      result!.mbaScopeTotals.nettExGst - clientPaysMedia
    )
    expect(billableMbaExGst).toBe(5000)
    expect(result!.validation.billableEqualsMba).toBe(true)

    const pl = result!.perLine[0]!
    expect(pl.media).toBe(4000)
    expect(sumMonths(pl.billingMonths)).toBe(4000)
    expect(sumMonths(pl.deliveryMonths)).toBe(4000)
  })
})
