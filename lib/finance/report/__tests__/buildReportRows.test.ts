import assert from "node:assert/strict"
import test from "node:test"

import { buildBillingScheduleJSON } from "../../../billing/buildBillingSchedule.js"
import type { BillingMonth } from "../../../billing/types.js"
import { derivePlanReceivableBillingRecordsForMonth } from "../../deriveReceivableRecords.js"
import { buildReportRows } from "../buildReportRows.js"

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

test("buildReportRows reconciles enriched line rows and month-level services to receivable totals", () => {
  const persisted = buildBillingScheduleJSON(enrichedFixture())
  const [record] = derivePlanReceivableBillingRecordsForMonth(
    [
      {
        id: 123,
        clients_id: 456,
        client_name: "Assembled Client",
        mba_number: "MBA-3B",
        campaign_name: "Report Rows",
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
  const rows = buildReportRows([record])

  assert.equal(round2(rows.reduce((sum, row) => sum + row.totalBillable, 0)), round2(record.total))
  assert.equal(
    round2(rows.filter((row) => row.rowKind === "media").reduce((sum, row) => sum + row.agencyFee, 0)),
    round2(money(persisted[0]!.feeTotal))
  )

  const clientPays = rows.find((row) => row.publisher === "DV360")
  assert.ok(clientPays)
  assert.equal(clientPays.clientPays, true)
  assert.equal(clientPays.mediaSpend, 0)
  assert.equal(clientPays.agencyFee, 200)
  assert.equal(clientPays.totalBillable, 200)

  assert.ok(rows.find((row) => row.rowKind === "service" && row.serviceType === "production"))
  assert.ok(rows.find((row) => row.rowKind === "service" && row.serviceType === "adServing"))
  assert.equal(rows.some((row) => row.serviceType === "agencyFee"), false)
})

test("buildReportRows emits visibly degraded agency fee fallback for legacy schedules", () => {
  const legacySchedule = [
    {
      monthYear: "May 2026",
      feeTotal: "$12.50",
      production: "$2.50",
      adservingTechFees: "$5.00",
      mediaTypes: [
        {
          mediaType: "Radio",
          lineItems: [
            {
              lineItemId: "legacy-radio-1",
              header1: "Nova",
              header2: "Sydney",
              amount: "$100.00",
            },
          ],
        },
      ],
    },
  ]

  const [record] = derivePlanReceivableBillingRecordsForMonth(
    [
      {
        id: 456,
        clients_id: 789,
        client_name: "Legacy Client",
        mba_number: "MBA-LEGACY",
        campaign_name: "Legacy Rows",
        campaign_status: "booked",
        version_number: 1,
        billingSchedule: legacySchedule,
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
  assert.equal(record.report_lines, undefined)
  const rows = buildReportRows([record])

  assert.equal(round2(rows.reduce((sum, row) => sum + row.totalBillable, 0)), round2(record.total))
  assert.ok(rows.find((row) => row.rowKind === "service" && row.serviceType === "agencyFee"))

  const mediaRow = rows.find((row) => row.rowKind === "media")
  assert.ok(mediaRow)
  assert.equal(mediaRow.publisher, "Nova")
  assert.equal(mediaRow.station, "Unspecified")
  assert.equal(mediaRow.buyType, "Unspecified")
  assert.equal(mediaRow.mediaSpend, 100)
  assert.equal(mediaRow.agencyFee, 0)
})
