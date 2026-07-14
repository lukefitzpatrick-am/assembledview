import assert from "node:assert/strict"
import test from "node:test"

import { buildBillingScheduleJSON } from "../../billing/buildBillingSchedule.js"
import type { BillingMonth } from "../../billing/types.js"
import { monthExGstFromScheduleEntry } from "../computeBillableAlignedMbaTotal.js"
import {
  computeCampaignFinancialsFromVersion,
  findScheduleMonthForCalendar,
} from "../computeCampaignFinancialsFromVersion.js"
import { derivePayableRecordsForMonth } from "../derivePayableRecords.js"
import { derivePlanReceivableBillingRecordsForMonth } from "../deriveReceivableRecords.js"
import { agencyOwedDeliveryMediaTotal } from "../scheduleMonthFinanceExtract.js"

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

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

/** krusty004-shaped campaign: mixed media + fee + ads + production on billing. */
function krusty004LikeVersion(): Record<string, unknown> {
  const month: BillingMonth = {
    monthYear: "May 2026",
    mediaTotal: "$1,500.00",
    feeTotal: "$350.00",
    totalAmount: "$1,950.00",
    adservingTechFees: "$25.00",
    production: "$75.00",
    mediaCosts: {
      ...emptyMediaCosts(),
      search: "$1,000.00",
      radio: "$500.00",
      production: "$75.00",
    },
    lineItems: {
      search: [
        {
          id: "billing-search::SEARCH1",
          header1: "Google Ads",
          header2: "Brand",
          monthlyAmounts: { "May 2026": 1000 },
          totalAmount: 1000,
          feeMonthlyAmounts: { "May 2026": 100 },
          totalFeeAmount: 100,
          mediaType: "Search",
          publisher: "Google Ads",
          buyType: "CPC",
        },
      ],
      radio: [
        {
          id: "billing-radio::RADIO1",
          header1: "Nova",
          header2: "Sydney",
          monthlyAmounts: { "May 2026": 500 },
          totalAmount: 500,
          feeMonthlyAmounts: { "May 2026": 50 },
          totalFeeAmount: 50,
          mediaType: "Radio",
          publisher: "Nova",
          buyType: "Spots",
          station: "Sydney",
        },
      ],
    },
  }

  // Persist as Xano/mediaTypes shape (what finance hub versions carry).
  const persisted = buildBillingScheduleJSON([month])
  return {
    id: 9001,
    clients_id: 42,
    client_name: "Krusty Co",
    mba_number: "krusty004",
    campaign_name: "Krusty Campaign",
    campaign_status: "booked",
    version_number: 3,
    billingSchedule: persisted,
    deliverySchedule: persisted,
  }
}

function clientPaysVersion(): Record<string, unknown> {
  const delivery: BillingMonth[] = [
    {
      monthYear: "May 2026",
      mediaTotal: "$8,000.00",
      feeTotal: "$2,000.00",
      totalAmount: "$10,000.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: { ...emptyMediaCosts(), progDisplay: "$8,000.00" },
      lineItems: {
        progDisplay: [
          {
            id: "billing-progDisplay::CP1",
            header1: "DV360",
            header2: "RON",
            monthlyAmounts: { "May 2026": 8000 },
            totalAmount: 8000,
            feeMonthlyAmounts: { "May 2026": 2000 },
            totalFeeAmount: 2000,
            clientPaysForMedia: true,
            mediaType: "Programmatic Display",
            publisher: "DV360",
          },
        ],
      },
    },
  ]
  const billing: BillingMonth[] = [
    {
      monthYear: "May 2026",
      mediaTotal: "$0.00",
      feeTotal: "$2,000.00",
      totalAmount: "$2,000.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: emptyMediaCosts(),
      lineItems: {
        progDisplay: [
          {
            id: "billing-progDisplay::CP1",
            header1: "DV360",
            header2: "RON",
            monthlyAmounts: { "May 2026": 0 },
            totalAmount: 0,
            feeMonthlyAmounts: { "May 2026": 2000 },
            totalFeeAmount: 2000,
            clientPaysForMedia: true,
            mediaType: "Programmatic Display",
            publisher: "DV360",
          },
        ],
      },
    },
  ]
  return {
    id: 9002,
    clients_id: 77,
    client_name: "Client Pays Co",
    mba_number: "clientpays001",
    campaign_name: "Client Pays Campaign",
    campaign_status: "booked",
    version_number: 1,
    billingSchedule: billing,
    deliverySchedule: delivery,
  }
}

test("R5: receivable total equals core billing month ex-GST (krusty004-like)", () => {
  const version = krusty004LikeVersion()
  const financials = computeCampaignFinancialsFromVersion(version)
  assert.ok(financials)
  const coreMonth = findScheduleMonthForCalendar(financials!.billingSchedule, 2026, 5)
  assert.ok(coreMonth)
  const coreBillingTotal = monthExGstFromScheduleEntry(
    coreMonth as unknown as Record<string, unknown>
  )
  assert.equal(coreBillingTotal, 1950)

  const [record] = derivePlanReceivableBillingRecordsForMonth(
    [version],
    2026,
    5,
    new Map(),
    new Map(),
    [],
    { includeNonBookedCampaigns: false }
  )
  assert.ok(record)
  assert.equal(round2(record.total), round2(coreBillingTotal))
})

test("R5: receivable total equals core billing month ex-GST (client-pays fee-only)", () => {
  const version = clientPaysVersion()
  const financials = computeCampaignFinancialsFromVersion(version)
  assert.ok(financials)
  const coreMonth = findScheduleMonthForCalendar(financials!.billingSchedule, 2026, 5)
  assert.ok(coreMonth)
  const coreBillingTotal = monthExGstFromScheduleEntry(
    coreMonth as unknown as Record<string, unknown>
  )
  assert.equal(coreBillingTotal, 2000)

  const [record] = derivePlanReceivableBillingRecordsForMonth(
    [version],
    2026,
    5,
    new Map(),
    new Map(),
    [],
    { includeNonBookedCampaigns: false }
  )
  assert.ok(record)
  assert.equal(round2(record.total), round2(coreBillingTotal))
  assert.equal(
    record.line_items.filter((li) => li.line_type === "media").length,
    0,
    "client-pays media is zero on billing — no media receivable lines"
  )
})

test("R5: payable agency total equals core delivery media ex client-pays (krusty004-like)", () => {
  const version = krusty004LikeVersion()
  const financials = computeCampaignFinancialsFromVersion(version)
  assert.ok(financials)
  const coreMonth = findScheduleMonthForCalendar(financials!.deliverySchedule, 2026, 5)
  assert.ok(coreMonth)
  const coreAgencyDelivery = agencyOwedDeliveryMediaTotal(coreMonth!)

  const records = derivePayableRecordsForMonth([version], 2026, 5)
  const payableSum = round2(records.reduce((s, r) => s + r.total, 0))
  assert.equal(payableSum, round2(coreAgencyDelivery))
  assert.equal(payableSum, 1500)
})

test("R5: payable agency total equals core delivery media ex client-pays (client-pays → $0 agency)", () => {
  const version = clientPaysVersion()
  const financials = computeCampaignFinancialsFromVersion(version)
  assert.ok(financials)
  const coreMonth = findScheduleMonthForCalendar(financials!.deliverySchedule, 2026, 5)
  assert.ok(coreMonth)
  const coreAgencyDelivery = agencyOwedDeliveryMediaTotal(coreMonth!)
  assert.equal(coreAgencyDelivery, 0)

  const records = derivePayableRecordsForMonth([version], 2026, 5)
  const payableSum = round2(records.reduce((s, r) => s + r.total, 0))
  assert.equal(payableSum, round2(coreAgencyDelivery))
  // Client-pays line still surfaced for UI.
  assert.ok(records.some((r) => r.line_items.some((li) => li.client_pays_media === true)))
})
