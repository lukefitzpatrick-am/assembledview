/**
 * Burst date timezone parity — serialize local-midnight Dates as YYYY-MM-DD
 * (Sydney civil day) and round-trip through billing so UTC servers keep
 * full-month July media / fee.
 *
 * Run under TZ=UTC: July media 10000 / parity ok:true; June + cross-month green.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { computeBillingAndDeliveryMonths } from "@/lib/billing/computeSchedule"
import type { BillingBurst } from "@/lib/billing/types"
import { assertCoreScheduleParity } from "@/lib/finance/assertCoreScheduleParity"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { parseMoneyInput } from "@/lib/format/money"
import { coerceBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { serializeBurstsJson } from "@/lib/mediaplan/serializeBurstsJson"

/** Simulate Melbourne (AEST, UTC+10) local-midnight Date as the client would create. */
function melbourneMidnight(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day) - 10 * 3600 * 1000)
}

function searchLine(
  startDate: string | Date,
  endDate: string | Date,
  budget = 10_000
): LineItemInput {
  return {
    lineItemId: "S-tz",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: budget,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 20,
    bursts: [
      {
        startDate,
        endDate,
        budget,
        buyAmount: 1,
      },
    ],
    approval: "approved",
  }
}

function julyMedia(schedule: ReturnType<typeof computeCampaignFinancials>["billingSchedule"]): number {
  const july = schedule.find((m) => m.monthYear === "July 2026")
  assert.ok(july, "expected a July 2026 billing month")
  return parseMoneyInput(july.mediaTotal) ?? 0
}

function julyFee(schedule: ReturnType<typeof computeCampaignFinancials>["billingSchedule"]): number {
  const july = schedule.find((m) => m.monthYear === "July 2026")
  assert.ok(july, "expected a July 2026 billing month")
  return parseMoneyInput(july.feeTotal) ?? 0
}

test("31-day July burst: serialize(Date) must keep full-month media/fee parity", () => {
  const expected = computeCampaignFinancials(
    [searchLine("2026-07-01", "2026-07-31")],
    { feeLoading: {} }
  )
  assert.equal(julyMedia(expected.billingSchedule), 10_000)
  assert.equal(julyFee(expected.billingSchedule), 2_500)

  const serialized = serializeBurstsJson({
    bursts: [
      {
        startDate: melbourneMidnight(2026, 6, 1),
        endDate: melbourneMidnight(2026, 6, 31),
        budget: 10_000,
        buyAmount: 1,
      },
    ],
    feePct: 20,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
  })
  assert.equal(serialized.length, 1)
  assert.equal(serialized[0]!.startDate, "2026-07-01")
  assert.equal(serialized[0]!.endDate, "2026-07-31")

  const persistedFinancials = computeCampaignFinancials(
    [searchLine(serialized[0]!.startDate, serialized[0]!.endDate)],
    { feeLoading: {} }
  )

  const startLocal = coerceBurstDateLocal(serialized[0]!.startDate)
  const endLocal = coerceBurstDateLocal(serialized[0]!.endDate)
  assert.ok(startLocal)
  assert.ok(endLocal)

  const persistedBurst: BillingBurst = {
    startDate: startLocal,
    endDate: endLocal,
    mediaAmount: 10_000,
    deliveryMediaAmount: 10_000,
    feeAmount: 2_500,
    totalAmount: 12_500,
    mediaType: "search",
    noAdserving: true,
    feePercentage: 20,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    deliverables: 1,
    buyType: "cpc",
    lineItemId: "S-tz",
  }
  const { billingMonths: persistedMonths } = computeBillingAndDeliveryMonths({
    campaignStart: startLocal,
    campaignEnd: endLocal,
    burstsByMediaType: { search: [persistedBurst] },
    getRateForMediaType: () => 0,
    adservaudio: 0,
    isManualBilling: false,
  })

  const parity = assertCoreScheduleParity(expected.billingSchedule, persistedFinancials.billingSchedule)
  const julyFromMonths = persistedMonths.find((m) => m.monthYear === "July 2026")
  const julyMediaFromMonths = parseMoneyInput(julyFromMonths?.mediaTotal) ?? 0

  assert.equal(
    julyMedia(persistedFinancials.billingSchedule),
    10_000,
    `July media should be full $10,000 after serialize round-trip; got ${julyMedia(persistedFinancials.billingSchedule)}`
  )
  assert.equal(
    julyFee(persistedFinancials.billingSchedule),
    2_500,
    `July fee should be full $2,500 after serialize round-trip; got ${julyFee(persistedFinancials.billingSchedule)}`
  )
  assert.equal(
    julyMediaFromMonths,
    10_000,
    `computeBillingAndDeliveryMonths July media should be $10,000; got ${julyMediaFromMonths}`
  )
  assert.equal(
    parity.ok,
    true,
    parity.ok ? undefined : `parity failed: ${parity.mismatches.map((m) => m.message).join("; ")}`
  )
})

test("30-day June burst: string dates stay full-month (over-correction guard)", () => {
  const expected = computeCampaignFinancials(
    [searchLine("2026-06-01", "2026-06-30")],
    { feeLoading: {} }
  )
  const serialized = serializeBurstsJson({
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        budget: 10_000,
        buyAmount: 1,
      },
    ],
    feePct: 20,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
  })
  const persisted = computeCampaignFinancials(
    [searchLine(serialized[0]!.startDate, serialized[0]!.endDate)],
    { feeLoading: {} }
  )
  const june = persisted.billingSchedule.find((m) => m.monthYear === "June 2026")
  assert.ok(june)
  assert.equal(parseMoneyInput(june.mediaTotal), 10_000)
  assert.equal(assertCoreScheduleParity(expected.billingSchedule, persisted.billingSchedule).ok, true)
})

test("cross-month July 25–Aug 5: string dates keep day-weighted split (over-correction guard)", () => {
  const expected = computeCampaignFinancials(
    [searchLine("2026-07-25", "2026-08-05")],
    { feeLoading: {} }
  )
  const serialized = serializeBurstsJson({
    bursts: [
      {
        startDate: "2026-07-25",
        endDate: "2026-08-05",
        budget: 10_000,
        buyAmount: 1,
      },
    ],
    feePct: 20,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
  })
  const persisted = computeCampaignFinancials(
    [searchLine(serialized[0]!.startDate, serialized[0]!.endDate)],
    { feeLoading: {} }
  )
  assert.equal(assertCoreScheduleParity(expected.billingSchedule, persisted.billingSchedule).ok, true)

  // 7 days in July (25–31) + 5 in August (1–5) = 12 days → July 7/12 of media.
  const july = persisted.billingSchedule.find((m) => m.monthYear === "July 2026")
  const august = persisted.billingSchedule.find((m) => m.monthYear === "August 2026")
  assert.ok(july)
  assert.ok(august)
  assert.equal(parseMoneyInput(july.mediaTotal), 5833.33)
  assert.equal(parseMoneyInput(august.mediaTotal), 4166.67)
})
