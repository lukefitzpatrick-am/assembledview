import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

vi.mock("@/lib/types/mediaPlanMaster", () => ({
  isLiveCampaignStatus: (status: string | null | undefined) => {
    const n = String(status ?? "")
      .trim()
      .toLowerCase()
    return n === "booked" || n === "approved"
  },
}))

vi.mock("@/lib/pacing/scope/resolveClientSlugs", () => ({
  slugifyPlanClientName: (name: string) =>
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
}))

vi.mock("@/lib/pacing/campaigns/fetchSearchPacingCampaignRows", () => ({
  fetchAllMasters: vi.fn(async () => []),
}))

import { resolveOverviewClientScope } from "../resolveOverviewClientScope"

type Master = {
  id: number
  mp_client_name: string | null
  campaign_start_date: string | null
  campaign_end_date: string | null
  campaign_status: string | null
}

function master(partial: Partial<Master> & Pick<Master, "id" | "mp_client_name">): Master {
  return {
    campaign_start_date: "2020-01-01",
    campaign_end_date: "2099-12-31",
    campaign_status: "booked",
    ...partial,
  }
}

describe("resolveOverviewClientScope", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns full portfolio in clientSlugs and paginates pageSlugs", async () => {
    const masters = [
      master({ id: 1, mp_client_name: "Acme Corp" }),
      master({ id: 2, mp_client_name: "Beta Inc" }),
      master({ id: 3, mp_client_name: "Gamma LLC" }),
    ]
    const result = await resolveOverviewClientScope(
      {
        asOfDate: "2026-07-01",
        accessAllowedClientSlugs: null,
        page: 1,
        pageSize: 2,
      },
      { fetchMasters: async () => masters as never[] }
    )

    expect(result.clientSlugs).toBeInstanceOf(Set)
    expect(result.clientSlugs.size).toBe(3)
    expect([...result.clientSlugs].sort()).toEqual([
      "acme-corp",
      "beta-inc",
      "gamma-llc",
    ])
    expect(result.pageSlugs).toHaveLength(2)
    expect(result.totalClients).toBe(3)
    expect(result.hasMore).toBe(true)
    expect(result.pageSize).toBe(2)
  })

  it("filters by accessAllowedClientSlugs", async () => {
    const masters = [
      master({ id: 1, mp_client_name: "Acme Corp" }),
      master({ id: 2, mp_client_name: "Beta Inc" }),
    ]
    const result = await resolveOverviewClientScope(
      {
        asOfDate: "2026-07-01",
        accessAllowedClientSlugs: new Set(["acme-corp"]),
        page: 1,
        pageSize: 40,
      },
      { fetchMasters: async () => masters as never[] }
    )

    expect(result.pageSlugs).toEqual(["acme-corp"])
    expect(result.totalClients).toBe(1)
  })

  it("pins to a single clientSlug when provided", async () => {
    const masters = [
      master({ id: 1, mp_client_name: "Acme Corp" }),
      master({ id: 2, mp_client_name: "Beta Inc" }),
    ]
    const result = await resolveOverviewClientScope(
      {
        asOfDate: "2026-07-01",
        accessAllowedClientSlugs: null,
        clientSlug: "beta-inc",
        page: 1,
        pageSize: 40,
      },
      { fetchMasters: async () => masters as never[] }
    )

    expect(result.pageSlugs).toEqual(["beta-inc"])
    expect(result.hasMore).toBe(false)
  })

  it("excludes ended / not-yet-started / non-live campaigns", async () => {
    const masters = [
      master({
        id: 1,
        mp_client_name: "Live Client",
        campaign_status: "booked",
        campaign_start_date: "2020-01-01",
        campaign_end_date: "2099-12-31",
      }),
      master({
        id: 2,
        mp_client_name: "Ended Client",
        campaign_status: "booked",
        campaign_start_date: "2020-01-01",
        campaign_end_date: "2020-06-01",
      }),
      master({
        id: 3,
        mp_client_name: "Draft Client",
        campaign_status: "draft",
        campaign_start_date: "2020-01-01",
        campaign_end_date: "2099-12-31",
      }),
    ]
    const result = await resolveOverviewClientScope(
      {
        asOfDate: "2026-07-01",
        accessAllowedClientSlugs: null,
        page: 1,
        pageSize: 40,
      },
      { fetchMasters: async () => masters as never[] }
    )

    expect(result.pageSlugs).toEqual(["live-client"])
  })

  it("clamps pageSize to OVERVIEW_MAX_PAGE_SIZE", async () => {
    const masters = Array.from({ length: 50 }, (_, i) =>
      master({ id: i + 1, mp_client_name: `Client ${i + 1}` })
    )
    const result = await resolveOverviewClientScope(
      {
        asOfDate: "2026-07-01",
        accessAllowedClientSlugs: null,
        page: 1,
        pageSize: 999,
      },
      { fetchMasters: async () => masters as never[] }
    )

    expect(result.pageSize).toBe(40)
    expect(result.pageSlugs).toHaveLength(40)
  })
})
