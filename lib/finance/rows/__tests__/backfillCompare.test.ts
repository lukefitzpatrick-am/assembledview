/**
 * Plan C S2-P4 — backfill compare unit tests.
 */
import { describe, expect, it } from "vitest"
import type { BillingMonth } from "@/lib/billing/types"
import type { CampaignFinancials, PerLineResult } from "@/lib/finance/campaignFinancials.types"
import {
  BACKFILL_TOLERANCE,
  collectBlobLineMonthTotals,
  compareBackfillRowsToBlob,
  compareGrandTotals,
  lineItemsFromPersistedFinancials,
} from "@/lib/finance/rows/backfillCompare"
import { backfillLineUid } from "@/lib/mediaplan/lineUid"
import { roundMoney2 } from "@/lib/format/money"

function month(
  monthYear: string,
  lines: Array<{
    id: string
    mediaType: string
    media: number
    fee?: number
    adserving?: number
    clientPays?: boolean
  }>,
  headers?: { media?: number; fee?: number; adserving?: number; production?: number }
): BillingMonth {
  const lineItems: BillingMonth["lineItems"] = {}
  let mediaSum = 0
  let feeSum = 0
  let adSum = 0
  for (const line of lines) {
    if (!lineItems[line.mediaType]) lineItems[line.mediaType] = []
    lineItems[line.mediaType]!.push({
      id: line.id,
      monthlyAmounts: { [monthYear]: line.media },
      feeMonthlyAmounts: { [monthYear]: line.fee ?? 0 },
      adServingMonthlyAmounts: { [monthYear]: line.adserving ?? 0 },
      clientPaysForMedia: line.clientPays === true,
      totalAmount: line.media,
      totalFeeAmount: line.fee ?? 0,
    })
    mediaSum += line.clientPays ? 0 : line.media
    feeSum += line.fee ?? 0
    adSum += line.adserving ?? 0
  }
  return {
    monthYear,
    mediaTotal: String(headers?.media ?? mediaSum),
    feeTotal: String(headers?.fee ?? feeSum),
    adservingTechFees: String(headers?.adserving ?? adSum),
    production: String(headers?.production ?? 0),
    totalAmount: String(
      (headers?.media ?? mediaSum) +
        (headers?.fee ?? feeSum) +
        (headers?.adserving ?? adSum) +
        (headers?.production ?? 0)
    ),
    mediaCosts: {
      search: "0",
      socialMedia: "0",
      television: "0",
      radio: "0",
      newspaper: "0",
      magazines: "0",
      ooh: "0",
      cinema: "0",
      digiDisplay: "0",
      digiAudio: "0",
      digiVideo: "0",
      bvod: "0",
      integration: "0",
      progDisplay: "0",
      progVideo: "0",
      progBvod: "0",
      progAudio: "0",
      progOoh: "0",
      influencers: "0",
      production: "0",
    },
    lineItems,
  } as BillingMonth
}

function financialsFromMonths(
  billing: BillingMonth[],
  delivery?: BillingMonth[]
): CampaignFinancials {
  const del = delivery ?? billing
  const byId = new Map<string, PerLineResult>()
  for (const m of del) {
    if (!m.lineItems) continue
    for (const [mediaType, items] of Object.entries(m.lineItems)) {
      for (const item of items ?? []) {
        const id = String(item.id)
        const media = Number(item.monthlyAmounts?.[m.monthYear] ?? 0) || 0
        const fee = Number(item.feeMonthlyAmounts?.[m.monthYear] ?? 0) || 0
        const existing = byId.get(id)
        if (existing) {
          existing.media = roundMoney2(existing.media + media)
          existing.fee = roundMoney2(existing.fee + fee)
          existing.nett = roundMoney2(existing.media + existing.fee)
          existing.billingMonths.push({ month: m.monthYear, amount: media })
          existing.deliveryMonths.push({ month: m.monthYear, amount: media })
        } else {
          byId.set(id, {
            lineItemId: id,
            mediaType,
            media: roundMoney2(media),
            fee: roundMoney2(fee),
            nett: roundMoney2(media + fee),
            deliverables: 0,
            billingMonths: [{ month: m.monthYear, amount: media }],
            deliveryMonths: [{ month: m.monthYear, amount: media }],
            flags: {
              clientPaysForMedia: item.clientPaysForMedia === true,
              manualBilling: false,
              manualFee: false,
              prepaid: false,
              excluded: false,
            },
          })
        }
      }
    }
  }
  const perLine = [...byId.values()]
  const grossMedia = roundMoney2(perLine.reduce((s, p) => s + p.media, 0))
  const fee = roundMoney2(perLine.reduce((s, p) => s + p.fee, 0))
  return {
    perLine,
    billingSchedule: billing,
    deliverySchedule: del,
    mbaScopeTotals: {
      grossMedia,
      fee,
      adServing: 0,
      production: 0,
      nettExGst: roundMoney2(grossMedia + fee),
      nettIncGst: roundMoney2((grossMedia + fee) * 1.1),
    },
    deliveryVsBillingDelta: [],
    validation: { billableEqualsMba: true, deltaExGst: 0 },
    mbaFeeAdjusted: false,
    rebill_needed: false,
  }
}

describe("backfillCompare", () => {
  it("lineItemsFromPersistedFinancials stamps deterministic backfill line_uids", () => {
    const billing = [
      month("June 2026", [
        { id: "MBA1TV1", mediaType: "television", media: 1000, fee: 100 },
      ]),
    ]
    const financials = financialsFromMonths(billing)
    const lines = lineItemsFromPersistedFinancials({
      financials,
      mba_number: "MBA1",
      media_plan_version: 42,
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].line_uid).toBe(
      backfillLineUid({
        mba_number: "MBA1",
        media_plan_version: 42,
        line_item_id: "MBA1TV1",
        table: "media_plan_television",
      })
    )
  })

  it("compareBackfillRowsToBlob is clean when rows match blob to the cent", () => {
    const billing = [
      month("June 2026", [
        { id: "L1", mediaType: "search", media: 5000, fee: 1000 },
      ]),
      month("July 2026", [
        { id: "L1", mediaType: "search", media: 5000, fee: 1000 },
      ]),
    ]
    const financials = financialsFromMonths(billing)
    const result = compareBackfillRowsToBlob({
      financials,
      mba_number: "MBA1",
      media_plan_version: 10,
    })
    expect(result.status).toBe("clean")
    expect(result.anomalyClass).toBeNull()
    expect(result.deltas).toHaveLength(0)
    expect(result.billingRowCount).toBeGreaterThan(0)
  })

  it("flags cent-drift when billing media disagrees", () => {
    const billing = [
      month("June 2026", [
        { id: "L1", mediaType: "search", media: 1000, fee: 0 },
      ]),
    ]
    const financials = financialsFromMonths(billing)
    // Corrupt perLine media months so buildRows emits different media than blob line stamp
    financials.perLine[0].billingMonths = [{ month: "June 2026", amount: 999 }]
    financials.perLine[0].deliveryMonths = [{ month: "June 2026", amount: 999 }]
    financials.perLine[0].media = 999

    const result = compareBackfillRowsToBlob({
      financials,
      mba_number: "MBA1",
      media_plan_version: 10,
    })
    expect(result.status).toBe("anomaly")
    expect(result.anomalyClass).toBe("cent-drift")
    expect(result.deltas.length).toBeGreaterThan(0)
    expect(
      result.deltas.some((d) => Math.abs(d.delta) > BACKFILL_TOLERANCE)
    ).toBe(true)
  })

  it("marks known-dup when isKnownDupVersion is set", () => {
    const billing = [
      month("June 2026", [
        { id: "L1", mediaType: "ooh", media: 200, fee: 0 },
      ]),
    ]
    const financials = financialsFromMonths(billing)
    const result = compareBackfillRowsToBlob({
      financials,
      mba_number: "MBA1",
      media_plan_version: 10,
      isKnownDupVersion: true,
    })
    expect(result.anomalyClass).toBe("known-dup")
  })

  it("collectBlobLineMonthTotals zeros client-pays billing media", () => {
    const billing = [
      month("June 2026", [
        {
          id: "CP1",
          mediaType: "television",
          media: 8000,
          fee: 800,
          clientPays: true,
        },
      ]),
    ]
    const map = collectBlobLineMonthTotals(billing, billing)
    const row = [...map.values()][0]
    expect(row.billingMedia).toBe(0)
    expect(row.deliveryMedia).toBe(8000)
  })

  it("compareGrandTotals ok within tolerance", () => {
    const billing = [
      month("June 2026", [
        { id: "L1", mediaType: "search", media: 100, fee: 20 },
      ]),
    ]
    const financials = financialsFromMonths(billing)
    const result = compareBackfillRowsToBlob({
      financials,
      mba_number: "MBA1",
      media_plan_version: 1,
    })
    const g = compareGrandTotals({
      billingRows: result.built.billingRows,
      deliveryRows: result.built.deliveryRows,
      billingSchedule: billing,
      deliverySchedule: billing,
    })
    expect(g.ok).toBe(true)
  })
})
