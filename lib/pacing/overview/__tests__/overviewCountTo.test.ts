/** The pacing Overview counts to the day before the view day (P1, 23 Oct). */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import { mapSpendRowToOverviewItem } from "../mapOverviewItems.js"

const skip = mockModuleSkip()

if (supportsMockModule()) {
  await mock.module!("@/lib/pacing/campaigns/pacingRowsCache", {
    namedExports: {
      pacingScopeKey: () => "all",
      getCachedSearchPacingRows: async () => [],
      getCachedSocialPacingRows: async () => [],
      getCachedProgrammaticPacingRows: async () => [],
      getCachedAdServingPacingRows: async () => [],
      getCachedDirectPacingRows: async () => [],
    },
  })
  await mock.module!("@/lib/pacing/overview/resolveOverviewClientScope", {
    namedExports: {
      OVERVIEW_DEFAULT_PAGE_SIZE: 20,
      OVERVIEW_MAX_PAGE_SIZE: 40,
      resolveOverviewClientScope: async () => {
        throw new Error("not used")
      },
    },
  })
}

function row(burst: { budget: number; startDate: string; endDate: string }, spend: number) {
  return {
    clientName: "Krusty Krab",
    campaignName: "krusty002",
    mbaNumber: "krusty002",
    lineItemId: "krusty002se1",
    currentBurst: burst,
    spendToDateCurrentBurst: spend,
    spendYesterday: 0,
    impressions: 0,
    clicks: 0,
  }
}

test("fetchers get the view day and the count-to day; payload carries both", { skip }, async () => {
  const { buildOverviewPayload } = await import("../buildOverviewPayload.js")
  const calls: Array<{ channel: string; args: unknown[] }> = []
  const track =
    (channel: string) =>
    async (...args: unknown[]) => {
      calls.push({ channel, args })
      return []
    }
  const payload = await buildOverviewPayload(
    { asOfDate: "2026-10-23", allowedClientSlugs: null, sourceTimeoutMs: 5_000 },
    {
      resolveScope: async () => ({
        clientSlugs: new Set(["krusty-krab"]),
        pageSlugs: ["krusty-krab"],
        page: 1,
        pageSize: 20,
        totalClients: 1,
        hasMore: false,
      }),
      fetchers: {
        search: track("search") as never,
        social: track("social") as never,
        programmatic: track("programmatic") as never,
        direct: track("direct") as never,
        adServing: track("adServing") as never,
      },
    },
  )
  assert.equal(payload.asOfDate, "2026-10-23")
  assert.equal(payload.countToDate, "2026-10-22")
  assert.equal(calls.length, 5)
  for (const call of calls) {
    assert.equal(call.args[0], "2026-10-23", call.channel)
    assert.equal(call.args.at(-1), "2026-10-22", call.channel)
  }
  const direct = calls.find((c) => c.channel === "direct")
  assert.equal(direct?.args[2], false)
})

test("an explicit count-to day wins", { skip }, async () => {
  const { buildOverviewPayload } = await import("../buildOverviewPayload.js")
  const payload = await buildOverviewPayload(
    { asOfDate: "2026-10-23", countToDate: "2026-10-20", allowedClientSlugs: null, sourceTimeoutMs: 5_000 },
    {
      resolveScope: async () => ({
        clientSlugs: new Set<string>(),
        pageSlugs: [],
        page: 1,
        pageSize: 20,
        totalClients: 0,
        hasMore: false,
      }),
      fetchers: {
        search: (async () => []) as never,
        social: (async () => []) as never,
        programmatic: (async () => []) as never,
        direct: (async () => []) as never,
        adServing: (async () => []) as never,
      },
    },
  )
  assert.equal(payload.countToDate, "2026-10-20")
})

test("a burst starting on the view day reads not started (no data)", () => {
  const item = mapSpendRowToOverviewItem(
    "search",
    row({ budget: 3_100, startDate: "2026-10-23", endDate: "2026-11-22" }, 0),
    "2026-10-22",
  )
  assert.equal(item.status, "no-data")
})

test("a burst that ended on the count-to day is fully expected, not completed", () => {
  // 31-day burst, ended 22 Oct, $1,000 of $3,100 spent: behind, not "completed" (on track).
  const behind = mapSpendRowToOverviewItem(
    "search",
    row({ budget: 3_100, startDate: "2026-09-22", endDate: "2026-10-22" }, 1_000),
    "2026-10-22",
  )
  assert.equal(behind.status, "behind")
  // Before P1 the same row was counted to the view day and read completed (on track).
  const before = mapSpendRowToOverviewItem(
    "search",
    row({ budget: 3_100, startDate: "2026-09-22", endDate: "2026-10-22" }, 1_000),
    "2026-10-23",
  )
  assert.equal(before.status, "on-track")
})
