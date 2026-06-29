import assert from "node:assert/strict"
import test from "node:test"

import { buildBillingScheduleJSON } from "../../billing/buildBillingSchedule.js"
import type { BillingMonth } from "../../billing/types.js"
import { derivePlanReceivableBillingRecordsForMonth } from "../deriveReceivableRecords.js"
import { extractReportLinesFromBillingSchedule } from "../extractReportLinesFromBillingSchedule.js"

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function money(value: string | undefined): number {
  if (!value) return 0
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

test("extractReportLinesFromBillingSchedule keeps client-pays fee-only enriched lines", () => {
  const persisted = buildBillingScheduleJSON(enrichedFixture())
  const reportLines = extractReportLinesFromBillingSchedule(persisted, "2026-05")

  const clientPays = reportLines.find((line) => line.publisher === "DV360")
  assert.ok(clientPays)
  assert.equal(clientPays.clientPaysForMedia, true)
  assert.equal(clientPays.mediaAmount, 0)
  assert.equal(clientPays.feeAmount, 200)
  assert.equal(clientPays.format, "Leaderboard")

  assert.equal(
    round2(reportLines.reduce((sum, line) => sum + line.feeAmount, 0)),
    round2(money(persisted[0]!.feeTotal))
  )
})

test("derivePlanReceivableBillingRecordsForMonth attaches report_lines without changing receivable media lines", () => {
  const persisted = buildBillingScheduleJSON(enrichedFixture())
  const [record] = derivePlanReceivableBillingRecordsForMonth(
    [
      {
        id: 123,
        clients_id: 456,
        client_name: "Assembled Client",
        mba_number: "MBA-3B",
        campaign_name: "Report Lines",
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
  assert.ok(record.report_lines)

  assert.equal(
    round2(record.report_lines.reduce((sum, line) => sum + line.feeAmount, 0)),
    round2(money(persisted[0]!.feeTotal))
  )
  assert.equal(
    round2(record.report_lines.reduce((sum, line) => sum + line.mediaAmount, 0)),
    round2(
      record.line_items
        .filter((line) => line.line_type === "media")
        .reduce((sum, line) => sum + line.amount, 0)
    )
  )
  assert.ok(record.report_lines.some((line) => line.clientPaysForMedia && line.mediaAmount === 0))
})
