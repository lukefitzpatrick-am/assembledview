import { describe, expect, it } from "vitest"

import { buildPlannedToDateByMba } from "@/lib/api/dashboard/plannedToDate"
import {
  applyDashboardTableFiltersToPlans,
  applyDashboardTableFiltersToScopes,
  computeHomeLiveKpiCounts,
  defaultDashboardViewFilters,
  describeHomeMetricsFilterScope,
  homeMediaSpendTile,
  isLiveScopeStatus,
  sumPlannedToDateForCampaigns,
  formatHomeMediaSpendTooltip,
} from "@/lib/dashboard/homeDashboardFilters"

function typesShapeEntry(monthYear: string, amount: string) {
  return {
    monthYear,
    mediaTypes: [{ mediaType: "Television", lineItems: [{ amount }] }],
  }
}

function plannedToDateVersion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mba_number: "inside001",
    version_number: 1,
    campaign_status: "booked",
    campaign_name: "Inside FY",
    campaign_start_date: "2025-08-01",
    campaign_end_date: "2025-08-31",
    published_at: "2025-08-01T00:00:00.000Z",
    deliverySchedule: [typesShapeEntry("August 2025", "$2,000.00")],
    ...overrides,
  }
}

const plans = [
  {
    mp_clientname: "Jayco",
    mp_campaignname: "Jayco NZ",
    mp_mba_number: "jayco003",
    mp_brand: "Jayco",
    mp_campaignstatus: "Booked",
  },
  {
    mp_clientname: "Jayco",
    mp_campaignname: "Jayco AU",
    mp_mba_number: "jayco001",
    mp_brand: "Jayco",
    mp_campaignstatus: "Approved",
  },
  {
    mp_clientname: "Acme",
    mp_campaignname: "Spring",
    mp_mba_number: "acme1",
    mp_brand: "Acme",
    mp_campaignstatus: "Booked",
  },
]

const scopes = [
  {
    client_name: "Jayco",
    project_name: "Jayco retainer",
    project_status: "Approved",
    project_overview: "Ongoing",
  },
  {
    client_name: "Acme",
    project_name: "Acme SOW",
    project_status: "In-Progress",
    project_overview: "Build",
  },
]

describe("homeDashboardFilters", () => {
  it("makes tile counts equal panel row counts for the same filtered set", () => {
    const filters = { ...defaultDashboardViewFilters(), campaignSearch: "Jayco" }
    const filteredPlans = applyDashboardTableFiltersToPlans(plans, filters)
    const filteredScopes = applyDashboardTableFiltersToScopes(scopes, filters)
    const kpis = computeHomeLiveKpiCounts(filteredPlans, filteredScopes)

    expect(kpis.liveCampaigns).toBe(filteredPlans.length)
    expect(kpis.liveScopes).toBe(filteredScopes.length)
    expect(kpis.liveCampaigns).toBe(2)
    expect(kpis.liveScopes).toBe(1)
    expect(kpis.liveClients).toBe(1)
  })

  it("applies campaign search to scopes as well as plans", () => {
    const filters = { ...defaultDashboardViewFilters(), campaignSearch: "retainer" }
    expect(applyDashboardTableFiltersToPlans(plans, filters)).toHaveLength(0)
    expect(applyDashboardTableFiltersToScopes(scopes, filters)).toHaveLength(1)
  })

  it("describes the metrics scope line", () => {
    expect(describeHomeMetricsFilterScope(defaultDashboardViewFilters())).toBe("All clients")
    expect(
      describeHomeMetricsFilterScope({
        ...defaultDashboardViewFilters(),
        campaignSearch: "Jayco",
      }),
    ).toBe('Filtered: search "Jayco"')
    expect(
      describeHomeMetricsFilterScope({
        ...defaultDashboardViewFilters(),
        clients: ["jayco"],
        campaignSearch: "NZ",
      }),
    ).toBe('Filtered: 1 client / search "NZ"')
  })

  it("dedupes live clients by normalized name case/whitespace", () => {
    const kpis = computeHomeLiveKpiCounts(
      [{ mp_clientname: "Penfolds" }, { mp_clientname: "penfolds" }, { mp_clientname: "Penfolds " }],
      [{ client_name: "PENFOLDS" }, { client_name: "Acme" }],
    )
    expect(kpis.liveCampaigns).toBe(3)
    expect(kpis.liveScopes).toBe(2)
    expect(kpis.liveClients).toBe(2)
  })

  it("treats scope status variants as live", () => {
    expect(isLiveScopeStatus("Approved")).toBe(true)
    expect(isLiveScopeStatus("approved")).toBe(true)
    expect(isLiveScopeStatus("In-Progress")).toBe(true)
    expect(isLiveScopeStatus("In Progress")).toBe(true)
    expect(isLiveScopeStatus(" in-progress ")).toBe(true)
    expect(isLiveScopeStatus("Draft")).toBe(false)
    expect(isLiveScopeStatus("Completed")).toBe(false)
  })
})

describe("home media spend to date", () => {
  const byMba = {
    jayco003: 10_000,
    jayco001: 2_500,
    extra999: 99_999,
  }

  it("sums byMba over a filtered set with a partial map", () => {
    const filtered = applyDashboardTableFiltersToPlans(plans, {
      ...defaultDashboardViewFilters(),
      campaignSearch: "Jayco",
    })
    expect(sumPlannedToDateForCampaigns(filtered, byMba)).toBe(12_500)
  })

  it("treats a missing map key as 0", () => {
    expect(sumPlannedToDateForCampaigns(plans, { jayco003: 10_000 })).toBe(10_000)
  })

  it("loading state renders no number", () => {
    const tile = homeMediaSpendTile("loading", plans, byMba)
    expect(tile.show).toBe(true)
    expect(tile.amount).toBeNull()
  })

  it("error state omits the tile", () => {
    const tile = homeMediaSpendTile("error", plans, byMba)
    expect(tile.show).toBe(false)
    expect(tile.amount).toBeNull()
  })

  it("ready state may be a true zero after a successful fetch", () => {
    expect(homeMediaSpendTile("ready", plans, {})).toEqual({ show: true, amount: 0 })
  })

  it("resolves a map built from a mixed-case MBA when the campaign row carries that same mixed-case number", () => {
    const byMba = buildPlannedToDateByMba([plannedToDateVersion({ mba_number: "Boss001" })], {
      fy: 2025,
    })
    // Join keys are case-insensitive; displayed/stored mba_number is unchanged.
    expect(Object.keys(byMba)).toEqual(["boss001"])
    expect(
      sumPlannedToDateForCampaigns([{ mp_mba_number: "Boss001" }], byMba),
    ).toBe(2000)
  })

  it("sums the mixed-case campaign set to every campaign, not a case-matched subset", () => {
    const byMba = buildPlannedToDateByMba(
      [
        plannedToDateVersion({
          mba_number: "jayco003",
          deliverySchedule: [typesShapeEntry("August 2025", "$10,000.00")],
        }),
        plannedToDateVersion({
          mba_number: "Boss001",
          deliverySchedule: [typesShapeEntry("August 2025", "$2,500.00")],
        }),
        plannedToDateVersion({
          mba_number: "PENFOLD016",
          deliverySchedule: [typesShapeEntry("August 2025", "$7,500.00")],
        }),
      ],
      { fy: 2025 },
    )
    const mixedCampaigns = [
      { mp_mba_number: "jayco003" },
      { mp_mba_number: "Boss001" },
      { mp_mba_number: "penfold016" },
    ]
    expect(sumPlannedToDateForCampaigns(mixedCampaigns, byMba)).toBe(20_000)
  })
})

describe("formatHomeMediaSpendTooltip", () => {
  it("includes the exact figure and Melbourne as-at date", () => {
    expect(formatHomeMediaSpendTooltip(1_057_700, new Date("2026-09-05T04:00:00.000Z"))).toBe(
      "$1,057,700.00 · Planned media, published versions, to 5 Sep 2026",
    )
  })
})
