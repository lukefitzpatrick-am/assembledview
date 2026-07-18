import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

vi.mock("@/lib/pacing/maths", () => ({
  getAsOfDate: () => "2026-07-01",
  computePacing: () => ({ status: "on_track", percentComplete: 50 }),
  calculateTimeProgress: () => 50,
  formatCurrency: (n: number) => `$${n}`,
  formatNumber: (n: number) => String(n),
  formatPercent: (n: number) => `${n}%`,
}))

vi.mock("@/lib/pacing/kpi/computeKpiStatus", () => ({
  computeRowKpiStatus: () => "on_track",
}))

vi.mock("@/lib/pacing/campaigns/pacingRowsCache", () => ({
  getCachedSearchPacingRows: vi.fn(async () => []),
  getCachedSocialPacingRows: vi.fn(async () => []),
  getCachedProgrammaticPacingRows: vi.fn(async () => []),
  getCachedDirectPacingRows: vi.fn(async () => []),
  getCachedAdServingPacingRows: vi.fn(async () => []),
}))

vi.mock("@/lib/types/mediaPlanMaster", () => ({
  isLiveCampaignStatus: () => true,
}))

vi.mock("@/lib/pacing/scope/resolveClientSlugs", () => ({
  slugifyPlanClientName: (name: string) => name,
}))

vi.mock("@/lib/pacing/campaigns/fetchSearchPacingCampaignRows", () => ({
  fetchAllMasters: vi.fn(async () => []),
}))

vi.mock("@/lib/pacing/overview/mapOverviewItems", () => ({
  mapSpendRowToOverviewItem: (channel: string, row: { clientName: string }) => ({
    id: `${channel}-${row.clientName}`,
    channel,
    clientName: row.clientName,
    campaignName: "c",
    mbaNumber: "1",
    lineItemLabel: "l",
    status: "behind",
    budget: 100,
    spendToDate: 10,
    href: `/pacing/${channel}`,
  }),
  mapDirectLineToOverviewItem: () => ({
    id: "d",
    channel: "direct",
    clientName: "",
    campaignName: "",
    mbaNumber: "",
    lineItemLabel: "",
    status: "on-track",
    budget: null,
    spendToDate: null,
    href: "/pacing/direct",
  }),
  mapAdServingRowToOverviewItem: () => ({
    id: "a",
    channel: "ad-serving",
    clientName: "",
    campaignName: "",
    mbaNumber: "",
    lineItemLabel: "",
    status: "on-track",
    budget: null,
    spendToDate: null,
    href: "/pacing/ad-serving",
  }),
  summarizeOverviewItems: (items: Array<{ clientName: string; status: string }>) => ({
    counts: {
      behind: items.filter((i) => i.status === "behind").length,
      onTrack: 0,
      ahead: 0,
      overPacing: 0,
      noData: 0,
      kpiPending: 0,
    },
    underperforming: items.filter((i) => i.status === "behind"),
    overPacing: [],
    aheadOnDelivery: [],
  }),
}))

vi.mock("@/lib/pacing/overview/resolveOverviewClientScope", () => ({
  resolveOverviewClientScope: vi.fn(),
}))

import {
  buildOverviewPayload,
  OVERVIEW_SOURCE_TIMEOUT_MS,
  withSourceTimeout,
} from "../buildOverviewPayload"
import type { OverviewClientScope } from "../resolveOverviewClientScope"

function emptyScope(
  overrides: Partial<OverviewClientScope> = {}
): OverviewClientScope {
  const pageSlugs = overrides.pageSlugs ?? ["acme"]
  return {
    page: 1,
    pageSize: 20,
    totalClients: pageSlugs.length,
    hasMore: false,
    pageSlugs,
    ...overrides,
    clientSlugs: overrides.clientSlugs ?? new Set(pageSlugs),
  }
}

function okRows() {
  return [] as never[]
}

describe("withSourceTimeout", () => {
  it("resolves when the promise finishes in time", async () => {
    await expect(
      withSourceTimeout(Promise.resolve("ok"), 200, "search")
    ).resolves.toBe("ok")
  })

  it("rejects when the promise exceeds the timeout", async () => {
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => resolve("late"), 80)
    })
    await expect(withSourceTimeout(slow, 20, "search")).rejects.toThrow(
      /timed out after 20ms/
    )
  })
})

describe("buildOverviewPayload", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses Promise.allSettled semantics: one slow source does not 504 the payload", async () => {
    const resolveScope = vi.fn(async () => emptyScope())
    const fetchers = {
      search: async () => okRows(),
      social: async () =>
        new Promise<never[]>((_resolve, reject) => {
          setTimeout(() => reject(new Error("social boom")), 5)
        }),
      programmatic: async () => okRows(),
      adServing: async () => okRows(),
      direct: async (_asOf: string, _slugs: Set<string>, _flag?: boolean) =>
        okRows(),
    }

    const payload = await buildOverviewPayload(
      {
        asOfDate: "2026-07-01",
        allowedClientSlugs: null,
        sourceTimeoutMs: 5_000,
      },
      { resolveScope, fetchers }
    )

    expect(payload.unavailableSources).toContain("social")
    expect(payload.availableSources).toEqual(
      expect.arrayContaining(["search", "programmatic", "ad-serving", "direct"])
    )
    expect(payload.availableSources).not.toContain("social")
    expect(payload.scope.clientSlugs).toEqual(["acme"])
    expect(payload.underperforming).toEqual([])
    expect(payload.overPacing).toEqual([])
    expect(payload.aheadOnDelivery).toEqual([])
  })

  it("marks a source unavailable when it exceeds sourceTimeoutMs", async () => {
    const resolveScope = vi.fn(async () => emptyScope())
    const fetchers = {
      search: async () =>
        new Promise<never[]>((resolve) => {
          setTimeout(() => resolve([]), 100)
        }),
      social: async () => okRows(),
      programmatic: async () => okRows(),
      adServing: async () => okRows(),
      direct: async () => okRows(),
    }

    const payload = await buildOverviewPayload(
      {
        asOfDate: "2026-07-01",
        allowedClientSlugs: null,
        sourceTimeoutMs: 25,
      },
      { resolveScope, fetchers }
    )

    expect(payload.unavailableSources).toContain("search")
    expect(payload.availableSources).toContain("social")
  })

  it("never passes null slug set into channel fetchers (scoped Set only)", async () => {
    const resolveScope = vi.fn(async () =>
      emptyScope({
        pageSlugs: ["acme"],
        clientSlugs: new Set(["acme", "beta"]),
        totalClients: 2,
        hasMore: true,
      })
    )
    const seen: Set<string>[] = []
    const track =
      () =>
      async (_asOf: string, slugs: Set<string>) => {
        seen.push(slugs)
        return okRows()
      }

    await buildOverviewPayload(
      {
        asOfDate: "2026-07-01",
        allowedClientSlugs: null,
        sourceTimeoutMs: 5_000,
      },
      {
        resolveScope,
        fetchers: {
          search: track(),
          social: track(),
          programmatic: track(),
          adServing: track(),
          direct: async (asOf, slugs, _includeInactive) => {
            // ChannelFetchers.direct still types slugs as Set|null (cache API),
            // but overview must only ever pass a scoped Set.
            if (!(slugs instanceof Set)) {
              throw new Error("overview must not pass null slug set")
            }
            return track()(asOf, slugs)
          },
        },
      }
    )

    expect(seen).toHaveLength(5)
    for (const slugs of seen) {
      expect(slugs).toBeInstanceOf(Set)
      expect([...slugs].sort()).toEqual(["acme", "beta"])
    }
  })

  it("KPI counts cover the portfolio while attention lists stay page-scoped", async () => {
    const resolveScope = vi.fn(async () =>
      emptyScope({
        pageSlugs: ["acme"],
        clientSlugs: new Set(["acme", "beta"]),
        totalClients: 2,
        hasMore: true,
      })
    )

    const searchRow = (clientName: string) =>
      ({
        clientName,
        campaignName: "c",
        mbaNumber: "1",
        lineItemId: "l",
        currentBurst: {
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          budget: 100,
        },
        spendToDateCurrentBurst: 10,
        spendYesterday: 1,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
      }) as never

    const payload = await buildOverviewPayload(
      {
        asOfDate: "2026-07-01",
        allowedClientSlugs: null,
        sourceTimeoutMs: 5_000,
      },
      {
        resolveScope,
        fetchers: {
          search: async () => [searchRow("acme"), searchRow("beta")],
          social: async () => okRows(),
          programmatic: async () => okRows(),
          adServing: async () => okRows(),
          direct: async () => okRows(),
        },
      }
    )

    expect(payload.counts.behind).toBe(2)
    expect(payload.underperforming.map((i) => i.clientName)).toEqual(["acme"])
    expect(payload.scope.clientSlugs).toEqual(["acme"])
    expect(payload.scope.totalClients).toBe(2)
  })

  it("exposes OVERVIEW_SOURCE_TIMEOUT_MS below the route maxDuration budget", () => {
    expect(OVERVIEW_SOURCE_TIMEOUT_MS).toBe(45_000)
    expect(OVERVIEW_SOURCE_TIMEOUT_MS).toBeLessThan(90_000)
  })
})
