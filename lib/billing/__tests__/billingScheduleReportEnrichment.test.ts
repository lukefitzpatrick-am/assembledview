import assert from "node:assert/strict"
import test from "node:test"

import { buildBillingScheduleJSON } from "../buildBillingSchedule.js"
import { parsePersistedBillingScheduleToMonths } from "../parsePersistedBillingScheduleToMonths.js"
import type { BillingMonth } from "../types.js"
import { derivePlanReceivableBillingRecordsForMonth } from "../../finance/deriveReceivableRecords.js"

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function money(value: string): number {
  return parseFloat(value.replace(/[^0-9.-]/g, "")) || 0
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

function enrichedFixture(): BillingMonth[] {
  return [
    {
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
        progDisplay: [
          {
            id: "billing-progDisplay::PD1",
            header1: "DV360",
            header2: "Run of network",
            monthlyAmounts: { "May 2026": 0 },
            totalAmount: 0,
            feeMonthlyAmounts: { "May 2026": 200 },
            totalFeeAmount: 200,
            clientPaysForMedia: true,
            mediaType: "Programmatic Display",
            publisher: "DV360",
            buyType: "CPM",
            format: "Leaderboard",
          },
        ],
      },
    },
  ]
}

test("billing schedule emits enriched line dimensions and per-month amounts for report reconciliation", () => {
  const persisted = buildBillingScheduleJSON(enrichedFixture())
  const mayLines = persisted[0]!.mediaTypes.flatMap((mediaType) => mediaType.lineItems as any[])

  const clientPaysLine = mayLines.find((line) => line.lineItemId === "billing-progDisplay::PD1")
  assert.ok(clientPaysLine)
  assert.equal(clientPaysLine.mediaType, "Programmatic Display")
  assert.equal(clientPaysLine.publisher, "DV360")
  assert.equal(clientPaysLine.buyType, "CPM")
  assert.equal(clientPaysLine.format, "Leaderboard")
  assert.equal(clientPaysLine.mediaAmount, 0)
  assert.equal(clientPaysLine.feeAmount, 200)
  assert.equal(clientPaysLine.clientPaysForMedia, true)

  const perLineFeeTotal = round2(mayLines.reduce((sum, line) => sum + (line.feeAmount ?? 0), 0))
  assert.equal(perLineFeeTotal, round2(money(persisted[0]!.feeTotal)))

  const [record] = derivePlanReceivableBillingRecordsForMonth(
    [
      {
        id: 123,
        clients_id: 456,
        client_name: "Assembled Client",
        mba_number: "MBA-3A",
        campaign_name: "Report Enrichment",
        campaign_status: "booked",
        version_number: 1,
        billingSchedule: persisted,
      },
    ],
    2026,
    5,
    new Map(),
    new Map(),
    [],
    { includeNonBookedCampaigns: false }
  )

  assert.ok(record)
  const serviceRowsExcludingAssembledFee = record.line_items
    .filter((line) => line.line_type === "service" && line.description !== "Assembled Fee")
    .reduce((sum, line) => sum + line.amount, 0)
  const perLineMediaTotal = mayLines.reduce((sum, line) => sum + (line.mediaAmount ?? 0), 0)
  assert.equal(
    round2(perLineMediaTotal + perLineFeeTotal + serviceRowsExcludingAssembledFee),
    record.total
  )
})

test("enriched persisted billing schedule round-trips while legacy lines stay undefined", () => {
  const persisted = buildBillingScheduleJSON(enrichedFixture())
  const reloaded = parsePersistedBillingScheduleToMonths(persisted)
  assert.ok(reloaded)

  const searchLine = reloaded[0]!.lineItems!.search![0]!
  assert.equal(searchLine.mediaType, "Search")
  assert.equal(searchLine.publisher, "Google Ads")
  assert.equal(searchLine.buyType, "CPC")
  assert.equal(searchLine.mediaAmount, 1000)
  assert.equal(searchLine.feeAmount, 100)

  const legacy = parsePersistedBillingScheduleToMonths([
    {
      monthYear: "May 2026",
      feeTotal: "$0.00",
      production: "$0.00",
      mediaTypes: [
        {
          mediaType: "Search",
          lineItems: [
            {
              lineItemId: "billing-search::legacy",
              header1: "Google Ads",
              header2: "Brand",
              amount: "$100.00",
            },
          ],
        },
      ],
    },
  ])
  assert.ok(legacy)
  const legacyLine = legacy[0]!.lineItems!.search![0]!
  assert.equal(legacyLine.mediaType, undefined)
  assert.equal(legacyLine.publisher, undefined)
  assert.equal(legacyLine.buyType, undefined)
  assert.equal(legacyLine.format, undefined)
  assert.equal(legacyLine.station, undefined)
  assert.equal(legacyLine.mediaAmount, undefined)
  assert.equal(legacyLine.feeAmount, undefined)
})
