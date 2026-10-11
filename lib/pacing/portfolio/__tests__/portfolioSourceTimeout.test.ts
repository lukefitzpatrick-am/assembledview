/**
 * A channel-source timeout must fail the portfolio build before upsert.
 * A successful read of zero rows is still stored.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { mock, test } from "node:test"

import { assembleCampaignPacingRows } from "../assembleCampaignPacingRows.js"
import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import { p6AssembleInput } from "./p6Fixture.js"

const skip = mockModuleSkip()

const input = p6AssembleInput()

const state: {
  search: () => Promise<typeof input.search>
  social: () => Promise<typeof input.social>
  programmatic: () => Promise<typeof input.programmatic>
  adServing: () => Promise<typeof input.adServing>
  direct: () => Promise<typeof input.direct>
  versions: () => Promise<Record<string, unknown>[]>
} = {
  search: async () => input.search,
  social: async () => input.social,
  programmatic: async () => input.programmatic,
  adServing: async () => input.adServing,
  direct: async () => input.direct,
  versions: async () => [],
}

const hits = {
  cached: { search: 0, social: 0, programmatic: 0, adServing: 0, direct: 0 },
  fresh: { search: 0, social: 0, programmatic: 0, adServing: 0, direct: 0 },
}

const upsert = mock.fn(
  async (payload: {
    asOfDate: string
    scopeKey: string
    liveOnly: boolean
    rows: unknown[]
    counts: {
      live: number
      behind: number
      on_track: number
      ahead: number
      over_pacing: number
      attention: number
    }
    durationMs: number
  }) => ({
    asOfDate: payload.asOfDate,
    scopeKey: payload.scopeKey,
    liveOnly: payload.liveOnly,
    rows: payload.rows,
    counts: payload.counts,
    generatedAt: "2026-10-10T00:00:00.000Z",
    durationMs: payload.durationMs,
  }),
)

if (supportsMockModule()) {
  await mock.module!("@/lib/pacing/campaigns/pacingRowsCache", {
    namedExports: {
      pacingScopeKey: (slugs: Set<string> | null) => (slugs == null ? "all" : "scoped"),
      getCachedSearchPacingRows: () => {
        hits.cached.search += 1
        return state.search()
      },
      getCachedSocialPacingRows: () => {
        hits.cached.social += 1
        return state.social()
      },
      getCachedProgrammaticPacingRows: () => {
        hits.cached.programmatic += 1
        return state.programmatic()
      },
      getCachedAdServingPacingRows: () => {
        hits.cached.adServing += 1
        return state.adServing()
      },
      getCachedDirectPacingRows: () => {
        hits.cached.direct += 1
        return state.direct()
      },
    },
  })
  await mock.module!("@/lib/data/readMediaPlans", {
    namedExports: {
      readPublishedOrLivePlanVersions: () => state.versions(),
    },
  })
  await mock.module!("@/lib/pacing/portfolio/portfolioSnapshotStore", {
    namedExports: {
      upsertPortfolioSnapshot: upsert,
    },
  })
  await mock.module!("@/lib/pacing/campaigns/fetchSearchPacingCampaignRows", {
    namedExports: {
      fetchSearchPacingCampaignRows: () => {
        hits.fresh.search += 1
        return state.search()
      },
    },
  })
  await mock.module!("@/lib/pacing/social/fetchSocialPacingCampaignRows", {
    namedExports: {
      fetchSocialPacingCampaignRows: () => {
        hits.fresh.social += 1
        return state.social()
      },
    },
  })
  await mock.module!("@/lib/pacing/programmatic/fetchProgrammaticPacingCampaignRows", {
    namedExports: {
      fetchProgrammaticPacingCampaignRows: () => {
        hits.fresh.programmatic += 1
        return state.programmatic()
      },
    },
  })
  await mock.module!("@/lib/pacing/ad-serving/fetchAdServingPacingCampaignRows", {
    namedExports: {
      fetchAdServingPacingCampaignRows: () => {
        hits.fresh.adServing += 1
        return state.adServing()
      },
    },
  })
  await mock.module!("@/lib/pacing/direct/fetchDirectPacingRows", {
    namedExports: {
      fetchDirectPacingRows: () => {
        hits.fresh.direct += 1
        return state.direct()
      },
    },
  })
}

function resetHits() {
  for (const bucket of [hits.cached, hits.fresh]) {
    bucket.search = 0
    bucket.social = 0
    bucket.programmatic = 0
    bucket.adServing = 0
    bucket.direct = 0
  }
}

function resetSources() {
  state.search = async () => input.search
  state.social = async () => input.social
  state.programmatic = async () => input.programmatic
  state.adServing = async () => input.adServing
  state.direct = async () => input.direct
  state.versions = async () => []
  resetHits()
  upsert.mock.resetCalls()
}

function buildArgs(perSourceTimeoutMs?: number, logPgTimeout?: boolean) {
  return {
    asOfDate: input.asOfDate,
    scopeKey: "all",
    liveOnly: true,
    allowedClientSlugs: null as Set<string> | null,
    perSourceTimeoutMs,
    logPgTimeout,
  }
}

function lockTimeoutError(): Error {
  const err = new Error("canceling statement due to lock timeout")
  ;(err as Error & { code: string }).code = "55P03"
  return err
}

test(
  "all sources resolve: rows are assembled and upserted",
  { skip },
  async () => {
    resetSources()
    const { buildAndStorePortfolioSnapshot } = await import(
      "../buildAndStorePortfolioSnapshot.js"
    )
    const expected = assembleCampaignPacingRows({
      ...input,
      schedulesByMba: new Map(),
    })

    const stored = await buildAndStorePortfolioSnapshot(buildArgs())

    assert.equal(stored.rows.length, expected.length)
    assert.ok(stored.rows.length > 0)
    assert.equal(upsert.mock.callCount(), 1)
    const payload = upsert.mock.calls[0]?.arguments[0] as { rows: unknown[] }
    assert.equal(payload.rows.length, expected.length)
  },
)

test(
  "search times out: the build throws and upsert is not called",
  { skip },
  async () => {
    resetSources()
    state.search = () => new Promise(() => {})
    const { buildAndStorePortfolioSnapshot } = await import(
      "../buildAndStorePortfolioSnapshot.js"
    )
    const lines: string[] = []
    const prev = console.log
    console.log = (...args: unknown[]) => {
      lines.push(args.map((part) => String(part)).join(" "))
    }
    try {
      await assert.rejects(
        () => buildAndStorePortfolioSnapshot(buildArgs(40)),
        (err: unknown) => {
          assert.ok(err instanceof Error)
          assert.equal(err.message, "portfolio source timeout: search")
          return true
        },
      )
    } finally {
      console.log = prev
    }

    assert.equal(upsert.mock.callCount(), 0)
    assert.ok(
      lines.some(
        (line) =>
          line.includes("pacing_portfolio_source_timing") &&
          line.includes('"source":"search"') &&
          line.includes('"timedOut":true'),
      ),
    )
  },
)

test(
  "search times out once then resolves: the build stores the row",
  { skip },
  async () => {
    resetSources()
    let calls = 0
    state.search = () => {
      calls += 1
      if (calls === 1) return new Promise(() => {})
      return Promise.resolve(input.search)
    }
    const { buildAndStorePortfolioSnapshot } = await import(
      "../buildAndStorePortfolioSnapshot.js"
    )
    const lines: string[] = []
    const prev = console.log
    console.log = (...args: unknown[]) => {
      lines.push(args.map((part) => String(part)).join(" "))
    }
    try {
      const stored = await buildAndStorePortfolioSnapshot(buildArgs(40))
      assert.ok(stored.rows.length > 0)
    } finally {
      console.log = prev
    }

    assert.equal(calls, 2)
    assert.equal(upsert.mock.callCount(), 1)
    const attempts = lines
      .map((line) => {
        try {
          return JSON.parse(line) as { event?: string; source?: string; attempt?: number; timedOut?: boolean }
        } catch {
          return null
        }
      })
      .filter((row) => row?.event === "pacing_portfolio_source_attempt" && row.source === "search")
    assert.equal(attempts.length, 2)
    assert.equal(attempts[0]?.attempt, 1)
    assert.equal(attempts[0]?.timedOut, true)
    assert.equal(attempts[1]?.attempt, 2)
    assert.equal(attempts[1]?.timedOut, false)
  },
)

test(
  "search times out twice: the build throws and upsert is not called",
  { skip },
  async () => {
    resetSources()
    let calls = 0
    state.search = () => {
      calls += 1
      return new Promise(() => {})
    }
    const { buildAndStorePortfolioSnapshot } = await import(
      "../buildAndStorePortfolioSnapshot.js"
    )
    const lines: string[] = []
    const prev = console.log
    console.log = (...args: unknown[]) => {
      lines.push(args.map((part) => String(part)).join(" "))
    }
    try {
      await assert.rejects(
        () => buildAndStorePortfolioSnapshot(buildArgs(40)),
        (err: unknown) => {
          assert.ok(err instanceof Error)
          assert.equal(err.message, "portfolio source timeout: search")
          return true
        },
      )
    } finally {
      console.log = prev
    }

    assert.equal(calls, 2)
    assert.equal(upsert.mock.callCount(), 0)
    const parsed = lines.flatMap((line) => {
      try {
        return [JSON.parse(line) as { event?: string; source?: string; attempt?: number; timedOut?: boolean; pending?: boolean; sources?: Array<{ source?: string; pending?: boolean }> }]
      } catch {
        return []
      }
    })
    const attempts = parsed.filter(
      (row) => row.event === "pacing_portfolio_source_attempt" && row.source === "search",
    )
    assert.equal(attempts.length, 2)
    assert.equal(attempts[0]?.timedOut, true)
    assert.equal(attempts[1]?.timedOut, true)
    const summary = parsed.find((row) => row.event === "pacing_portfolio_source_timing")
    const names = (summary?.sources ?? []).map((row) => row.source)
    for (const name of ["search", "social", "programmatic", "adServing", "direct", "versions"]) {
      assert.ok(names.includes(name), name)
    }
  },
)

test(
  "social resolves with 0 rows: the build upserts",
  { skip },
  async () => {
    resetSources()
    state.social = async () => []
    const { buildAndStorePortfolioSnapshot } = await import(
      "../buildAndStorePortfolioSnapshot.js"
    )
    const expected = assembleCampaignPacingRows({
      ...input,
      social: [],
      schedulesByMba: new Map(),
    })

    const stored = await buildAndStorePortfolioSnapshot(buildArgs())

    assert.equal(stored.rows.length, expected.length)
    assert.equal(upsert.mock.callCount(), 1)
  },
)

test(
  "versions imply 3 live campaigns and rows hold 2: warn with the missing id, still upsert",
  { skip },
  async () => {
    resetSources()
    state.search = async () =>
      input.search.filter(
        (row) => row.mbaNumber === "letsgo001" || row.mbaNumber === "jayco001",
      )
    state.social = async () => []
    state.programmatic = async () => []
    state.adServing = async () => []
    state.direct = async () => []
    const live = (mba: string) => ({
      mba_number: mba,
      campaign_status: "booked",
      campaign_start_date: "2026-07-01",
      campaign_end_date: "2026-12-31",
    })
    state.versions = async () => [
      live("letsgo001"),
      live("jayco001"),
      live("missing001"),
      {
        mba_number: "done001",
        campaign_status: "completed",
        campaign_start_date: "2026-07-01",
        campaign_end_date: "2026-12-31",
      },
    ]
    const { buildAndStorePortfolioSnapshot } = await import(
      "../buildAndStorePortfolioSnapshot.js"
    )
    const lines: string[] = []
    const prev = console.log
    console.log = (...args: unknown[]) => {
      lines.push(args.map((part) => String(part)).join(" "))
    }
    try {
      await buildAndStorePortfolioSnapshot(buildArgs())
    } finally {
      console.log = prev
    }

    assert.equal(upsert.mock.callCount(), 1)
    const warning = lines
      .map((line) => {
        try {
          return JSON.parse(line) as {
            event?: string
            counts?: { live?: number }
            expectedLive?: number
            missingCampaignIds?: string[]
          }
        } catch {
          return null
        }
      })
      .find((row) => row?.event === "pacing_portfolio_live_count_low")
    assert.ok(warning)
    assert.equal(warning.counts?.live, 2)
    assert.equal(warning.expectedLive, 3)
    assert.deepEqual(warning.missingCampaignIds, ["missing001"])
  },
)

test(
  "a versions-read timeout still throws and does not upsert",
  { skip },
  async () => {
    resetSources()
    state.versions = () => new Promise(() => {})
    const { buildAndStorePortfolioSnapshot } = await import(
      "../buildAndStorePortfolioSnapshot.js"
    )

    await assert.rejects(
      () => buildAndStorePortfolioSnapshot(buildArgs(40)),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, "portfolio versions read timed out")
        return true
      },
    )
    assert.equal(upsert.mock.callCount(), 0)
  },
)

test(
  "a lock_timeout on the direct masters read retries, then surfaces as a source failure",
  { skip },
  async () => {
    resetSources()
    let calls = 0
    state.direct = () => {
      calls += 1
      return Promise.reject(lockTimeoutError())
    }
    const { buildAndStorePortfolioSnapshot } = await import(
      "../buildAndStorePortfolioSnapshot.js"
    )
    const lines: string[] = []
    const prev = console.log
    console.log = (...args: unknown[]) => {
      lines.push(args.map((arg) => String(arg)).join(" "))
    }

    try {
      await assert.rejects(
        () => buildAndStorePortfolioSnapshot(buildArgs(40, true)),
        (err: unknown) => {
          assert.ok(err instanceof Error)
          assert.equal(err.message, "portfolio source timeout: direct")
          return true
        },
      )
    } finally {
      console.log = prev
    }

    assert.equal(calls, 2)
    assert.equal(upsert.mock.callCount(), 0)
    const logged = lines
      .map((line) => {
        try {
          return JSON.parse(line) as {
            event?: string
            source?: string
            code?: string
            ms?: number
          }
        } catch {
          return null
        }
      })
      .filter((row) => row?.event === "pacing_portfolio_pg_timeout")
    assert.ok(logged.length >= 1)
    assert.equal(logged[0]?.source, "direct")
    assert.equal(logged[0]?.code, "55P03")
    assert.equal(typeof logged[0]?.ms, "number")
  },
)

const cachedOnce = { search: 1, social: 1, programmatic: 1, adServing: 1, direct: 1 }
const freshNone = { search: 0, social: 0, programmatic: 0, adServing: 0, direct: 0 }

test(
  "cache: false calls the composers without the cache wrapper; the default path uses it",
  { skip },
  async () => {
    resetSources()
    const { buildAndStorePortfolioSnapshot } = await import(
      "../buildAndStorePortfolioSnapshot.js"
    )

    await buildAndStorePortfolioSnapshot(buildArgs())
    assert.deepEqual(hits.cached, cachedOnce)
    assert.deepEqual(hits.fresh, freshNone)

    resetSources()
    await buildAndStorePortfolioSnapshot({ ...buildArgs(), cache: false })
    assert.deepEqual(hits.cached, freshNone)
    assert.deepEqual(hits.fresh, cachedOnce)
  },
)

test("the cron handler passes cache: false and the user build does not", () => {
  const cron = readFileSync("app/api/cron/pacing-portfolio/route.ts", "utf8")
  assert.match(cron, /cache:\s*false/)
  const serve = readFileSync("lib/pacing/portfolio/servePortfolioSnapshot.ts", "utf8")
  const buildArgsSource = serve.slice(serve.indexOf("function buildArgs"))
  assert.equal(buildArgsSource.includes("cache:"), false)
})
