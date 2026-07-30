import { describe, expect, it } from "vitest"

import {
  applyDashboardTableFiltersToPlans,
  applyDashboardTableFiltersToScopes,
  computeHomeLiveKpiCounts,
  defaultDashboardViewFilters,
  describeHomeMetricsFilterScope,
} from "@/lib/dashboard/homeDashboardFilters"

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
})
