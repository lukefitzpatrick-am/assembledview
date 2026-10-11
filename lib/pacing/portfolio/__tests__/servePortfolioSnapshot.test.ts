import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { runPortfolioCronBuild } from "../runPortfolioCron.js"
import { servePortfolioSnapshot } from "../servePortfolioSnapshot.js"
import type { CampaignPacingRow, PortfolioPacingCounts } from "../types.js"
import { P6_AS_OF, p6FixtureRows } from "./p6Fixture.js"

const COUNTS: PortfolioPacingCounts = {
  live: 6,
  behind: 1,
  on_track: 2,
  ahead: 1,
  over_pacing: 1,
  attention: 4,
}

function snapshotRow(overrides?: {
  scopeKey?: string
  generatedAt?: string
  rows?: CampaignPacingRow[]
}) {
  return {
    asOfDate: P6_AS_OF,
    scopeKey: overrides?.scopeKey ?? "all",
    liveOnly: true,
    rows: overrides?.rows ?? p6FixtureRows(),
    counts: COUNTS,
    generatedAt: overrides?.generatedAt ?? "2026-09-17T07:00:00.000Z",
    durationMs: 12_400,
  }
}

describe("servePortfolioSnapshot", () => {
  it("snapshot hit returns stored rows and generated_at", async () => {
    const stored = snapshotRow()
    let builds = 0
    const result = await servePortfolioSnapshot({
      asOf: P6_AS_OF,
      liveOnly: true,
      scopeKey: "all",
      allowedClientSlugs: null,
      isAdmin: true,
      refresh: false,
      readSnapshot: async () => stored,
      buildAndStore: async () => {
        builds += 1
        return snapshotRow({ generatedAt: "2026-09-17T08:00:00.000Z" })
      },
      scheduleBuild: () => {
        throw new Error("should not schedule on a hit")
      },
    })

    assert.equal(result.status, 200)
    if (result.status !== 200) return
    assert.equal(result.body.asOf, P6_AS_OF)
    assert.equal(result.body.generated_at, "2026-09-17T07:00:00.000Z")
    assert.equal(result.body.rows.length, stored.rows.length)
    assert.deepEqual(result.body.counts, COUNTS)
    assert.equal(builds, 0)
  })

  it("miss admin builds and stores", async () => {
    const built = snapshotRow({ generatedAt: "2026-09-17T07:05:00.000Z" })
    let builds = 0
    const result = await servePortfolioSnapshot({
      asOf: P6_AS_OF,
      liveOnly: true,
      scopeKey: "all",
      allowedClientSlugs: null,
      isAdmin: true,
      refresh: false,
      readSnapshot: async () => null,
      buildAndStore: async (args) => {
        builds += 1
        assert.equal(args.asOfDate, P6_AS_OF)
        assert.equal(args.scopeKey, "all")
        assert.equal(args.liveOnly, true)
        assert.equal(args.allowedClientSlugs, null)
        return built
      },
      scheduleBuild: () => {
        throw new Error("admin miss builds inline")
      },
    })

    assert.equal(result.status, 200)
    if (result.status !== 200) return
    assert.equal(result.body.generated_at, "2026-09-17T07:05:00.000Z")
    assert.equal(builds, 1)
  })

  it("miss client returns 202 and schedules a scope-key build", async () => {
    const slugs = new Set(["penfolds"])
    const scheduled: Array<() => Promise<void>> = []
    let builds = 0
    const result = await servePortfolioSnapshot({
      asOf: P6_AS_OF,
      liveOnly: true,
      scopeKey: "penfolds",
      allowedClientSlugs: slugs,
      isAdmin: false,
      refresh: false,
      readSnapshot: async () => null,
      buildAndStore: async (args) => {
        builds += 1
        assert.equal(args.scopeKey, "penfolds")
        assert.equal(args.allowedClientSlugs, slugs)
        return snapshotRow({ scopeKey: "penfolds" })
      },
      scheduleBuild: (work) => {
        scheduled.push(work)
      },
    })

    assert.equal(result.status, 202)
    if (result.status !== 202) return
    assert.deepEqual(result.body, { building: true })
    assert.equal(builds, 0)
    assert.equal(scheduled.length, 1)
    await scheduled[0]!()
    assert.equal(builds, 1)
  })

  it("refresh=1 admin rebuilds even when a snapshot exists", async () => {
    const stored = snapshotRow({ generatedAt: "2026-09-17T07:00:00.000Z" })
    const rebuilt = snapshotRow({ generatedAt: "2026-09-17T08:30:00.000Z" })
    let builds = 0
    const result = await servePortfolioSnapshot({
      asOf: P6_AS_OF,
      liveOnly: true,
      scopeKey: "all",
      allowedClientSlugs: null,
      isAdmin: true,
      refresh: true,
      readSnapshot: async () => stored,
      buildAndStore: async () => {
        builds += 1
        return rebuilt
      },
      scheduleBuild: () => {
        throw new Error("admin refresh builds inline")
      },
    })

    assert.equal(result.status, 200)
    if (result.status !== 200) return
    assert.equal(result.body.generated_at, "2026-09-17T08:30:00.000Z")
    assert.equal(builds, 1)
  })

  it("a failed build with a 10 Oct row returns 200 and stale.asOf", async () => {
    const prior = { ...snapshotRow(), asOfDate: "2026-10-10" }
    let builds = 0
    const result = await servePortfolioSnapshot({
      asOf: "2026-10-11",
      liveOnly: true,
      scopeKey: "all",
      allowedClientSlugs: null,
      isAdmin: true,
      refresh: false,
      readSnapshot: async () => null,
      readLatestPrior: async (key) => {
        assert.equal(key.asOfDate, "2026-10-11")
        assert.equal(key.scopeKey, "all")
        assert.equal(key.liveOnly, true)
        return prior
      },
      buildAndStore: async () => {
        builds += 1
        throw new Error("portfolio source timeout: search")
      },
      scheduleBuild: () => {
        throw new Error("admin failure does not schedule")
      },
    })

    assert.equal(builds, 1)
    assert.equal(result.status, 200)
    if (result.status !== 200) return
    assert.equal(result.body.stale?.asOf, "2026-10-10")
    assert.equal(result.body.asOf, "2026-10-10")
  })
})

describe("runPortfolioCronBuild", () => {
  it("retry flag with today's row present skips the build", async () => {
    let builds = 0
    const result = await runPortfolioCronBuild({
      retry: true,
      readToday: async () => ({ asOfDate: "2026-10-11" }),
      build: async () => {
        builds += 1
        return { asOfDate: "2026-10-11" }
      },
    })

    assert.equal(result.status, "already built")
    assert.equal(builds, 0)
  })
})
