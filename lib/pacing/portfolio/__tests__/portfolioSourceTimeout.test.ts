/**
 * A channel-source timeout must fail the portfolio build before upsert.
 * A successful read of zero rows is still stored.
 */
import assert from "node:assert/strict"
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
      getCachedSearchPacingRows: () => state.search(),
      getCachedSocialPacingRows: () => state.social(),
      getCachedProgrammaticPacingRows: () => state.programmatic(),
      getCachedAdServingPacingRows: () => state.adServing(),
      getCachedDirectPacingRows: () => state.direct(),
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
}

function resetSources() {
  state.search = async () => input.search
  state.social = async () => input.social
  state.programmatic = async () => input.programmatic
  state.adServing = async () => input.adServing
  state.direct = async () => input.direct
  state.versions = async () => []
  upsert.mock.resetCalls()
}

function buildArgs(perSourceTimeoutMs?: number) {
  return {
    asOfDate: input.asOfDate,
    scopeKey: "all",
    liveOnly: true,
    allowedClientSlugs: null as Set<string> | null,
    perSourceTimeoutMs,
  }
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
