/**
 * `deliveryScheduleByMBA` (client.ts) must use the SAME booked/approved/completed filter as the
 * spend-by-media-type / spend-by-campaign charts, so a cancelled campaign can't feed `totalSpend`
 * while being correctly excluded from the charts.
 */
import { describe, expect, it } from "vitest"

import { buildClientDashboardDataFromVersions } from "../client"
import { slugifyClientName } from "../shared"
import { australianFyStartYearForDate } from "@/lib/finance/months"
import { CLIENT_ALL_TIME_END, CLIENT_ALL_TIME_START } from "@/lib/dashboard/clientDateRange"

const CLIENT_NAME = "Acme Co"

function version(overrides: Record<string, any>): Record<string, any> {
  return {
    mp_client_name: CLIENT_NAME,
    version_number: 1,
    campaign_name: "Campaign",
    campaign_start_date: "2025-08-01",
    campaign_end_date: "2025-08-31",
    mp_campaignbudget: "0",
    published_at: "2025-08-01T00:00:00.000Z",
    ...overrides,
  }
}

function typesShapeEntry(amount: string): any {
  return {
    monthYear: "August 2025",
    mediaTypes: [{ mediaType: "Television", lineItems: [{ amount }] }],
  }
}

describe("buildClientDashboardDataFromVersions — deliveryScheduleByMBA campaign filter", () => {
  it("excludes a cancelled campaign's delivery schedule from totalSpend (same set as charts)", () => {
    const targetSlugs = new Set([slugifyClientName(CLIENT_NAME)])

    const bookedVersion = version({
      mba_number: "MBA-100",
      campaign_status: "booked",
      campaign_name: "Booked Campaign",
      deliverySchedule: [typesShapeEntry("$1,000.00")],
    })
    const cancelledVersion = version({
      mba_number: "MBA-200",
      campaign_status: "cancelled",
      campaign_name: "Cancelled Campaign",
      deliverySchedule: [typesShapeEntry("$5,000.00")],
    })

    const dashboard = buildClientDashboardDataFromVersions(
      targetSlugs,
      [bookedVersion, cancelledVersion],
      {
        fallbackClient: null,
        totalCampaignsYTDFromMaster: null,
        urlSlug: "acme-co",
        financialYearStartYear: 2025,
      },
    )

    expect(dashboard).not.toBeNull()
    const chartTotal = (dashboard!.spendByMediaType ?? []).reduce((sum, row) => sum + row.amount, 0)

    // Chart was already correctly scoped to booked/approved/completed campaigns.
    expect(chartTotal).toBeCloseTo(1000, 2)

    // totalSpend must reflect the SAME campaign set as the charts (booked only) — not the
    // cancelled campaign's $5,000 on top.
    expect(dashboard!.totalSpend).toBeCloseTo(1000, 2)
    expect(dashboard!.totalSpend).toBeCloseTo(chartTotal, 2)
  })

  it("still counts a 'costs'-shape booked campaign's media (regression check alongside the filter fix)", () => {
    const targetSlugs = new Set([slugifyClientName(CLIENT_NAME)])

    const bookedCostsVersion = version({
      mba_number: "MBA-300",
      campaign_status: "approved",
      campaign_name: "Costs Shape Campaign",
      deliverySchedule: [
        {
          monthYear: "August 2025",
          mediaCosts: { television: "$2,000.00", bvod: "$500.00" },
          mediaTotal: "$2,500.00",
          feeTotal: "$300.00",
          totalAmount: "$2,800.00",
        },
      ],
    })

    const dashboard = buildClientDashboardDataFromVersions(
      targetSlugs,
      [bookedCostsVersion],
      {
        fallbackClient: null,
        totalCampaignsYTDFromMaster: null,
        urlSlug: "acme-co",
        financialYearStartYear: 2025,
      },
    )

    expect(dashboard).not.toBeNull()
    const chartTotal = (dashboard!.spendByMediaType ?? []).reduce((sum, row) => sum + row.amount, 0)

    // Media (2,500) must appear in the chart, not just the 300 fee.
    expect(chartTotal).toBeCloseTo(2500, 2)
    expect(dashboard!.totalSpend).toBeCloseTo(2800, 2)
  })

  it("lists only campaigns whose flight overlaps the requested range (live/planning/completed still vs today)", () => {
    const targetSlugs = new Set([slugifyClientName(CLIENT_NAME)])
    const overlapping = version({
      mba_number: "MBA-OVER",
      campaign_status: "booked",
      campaign_name: "Overlaps FY",
      campaign_start_date: "2026-01-01",
      campaign_end_date: "2026-12-31",
    })
    const outside = version({
      mba_number: "MBA-OUT",
      campaign_status: "booked",
      campaign_name: "Outside FY",
      campaign_start_date: "2025-01-01",
      campaign_end_date: "2025-06-30",
    })

    const dashboard = buildClientDashboardDataFromVersions(targetSlugs, [overlapping, outside], {
      fallbackClient: null,
      totalCampaignsYTDFromMaster: null,
      urlSlug: "acme-co",
      rangeStartISO: "2026-07-01",
      rangeEndISO: "2027-06-30",
    })

    expect(dashboard).not.toBeNull()
    const names = [
      ...dashboard!.liveCampaignsList,
      ...dashboard!.planningCampaignsList,
      ...dashboard!.completedCampaignsList,
    ].map((c) => c.campaignName)
    expect(names).toContain("Overlaps FY")
    expect(names).not.toContain("Outside FY")
  })

  it("omitted range pins totalSpend to current AU FY, not all-time", () => {
    const year = australianFyStartYearForDate(new Date())
    const targetSlugs = new Set([slugifyClientName(CLIENT_NAME)])
    const inFy = version({
      mba_number: "MBA-INFY",
      campaign_status: "booked",
      campaign_name: "In current FY",
      campaign_start_date: `${year}-07-01`,
      campaign_end_date: `${year}-07-31`,
      deliverySchedule: [
        {
          monthYear: `July ${year}`,
          mediaTypes: [{ mediaType: "Television", lineItems: [{ amount: "$400.00" }] }],
        },
      ],
    })
    const priorFy = version({
      mba_number: "MBA-PRIOR",
      campaign_status: "booked",
      campaign_name: "Prior FY",
      campaign_start_date: `${year - 1}-08-01`,
      campaign_end_date: `${year - 1}-08-31`,
      deliverySchedule: [
        {
          monthYear: `August ${year - 1}`,
          mediaTypes: [{ mediaType: "Television", lineItems: [{ amount: "$1,000.00" }] }],
        },
      ],
    })

    const implicit = buildClientDashboardDataFromVersions(targetSlugs, [inFy, priorFy], {
      fallbackClient: null,
      totalCampaignsYTDFromMaster: null,
      urlSlug: "acme-co",
    })
    const explicitCurrentFy = buildClientDashboardDataFromVersions(targetSlugs, [inFy, priorFy], {
      fallbackClient: null,
      totalCampaignsYTDFromMaster: null,
      urlSlug: "acme-co",
      financialYearStartYear: year,
    })
    const allTime = buildClientDashboardDataFromVersions(targetSlugs, [inFy, priorFy], {
      fallbackClient: null,
      totalCampaignsYTDFromMaster: null,
      urlSlug: "acme-co",
      rangeStartISO: CLIENT_ALL_TIME_START,
      rangeEndISO: CLIENT_ALL_TIME_END,
    })

    expect(implicit).not.toBeNull()
    expect(explicitCurrentFy).not.toBeNull()
    expect(allTime).not.toBeNull()
    expect(implicit!.totalSpend).toBeCloseTo(400, 2)
    expect(implicit!.totalSpend).toBeCloseTo(explicitCurrentFy!.totalSpend, 2)
    expect(allTime!.totalSpend).toBeCloseTo(1400, 2)
    expect(implicit!.totalSpend).not.toBeCloseTo(allTime!.totalSpend, 2)
  })
})
