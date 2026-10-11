import type { CampaignPacingRow, PortfolioPacingCounts } from "./types"

export type PortfolioSnapshotRecord = {
  asOfDate: string
  scopeKey: string
  liveOnly: boolean
  rows: CampaignPacingRow[]
  counts: PortfolioPacingCounts
  generatedAt: string
  durationMs: number | null
}

export type BuildPortfolioSnapshotArgs = {
  asOfDate: string
  scopeKey: string
  liveOnly: boolean
  allowedClientSlugs: Set<string> | null
  /** Request start, so the 240s budget includes work before the builder. */
  startedAt?: number
  /** Unset on the serving path, so each source keeps the 90s cap. */
  perSourceTimeoutMs?: number
  /** Cron only. A Postgres lock or statement timeout logs one line. */
  logPgTimeout?: boolean
  /** Unset uses the 4h composer cache. The cron passes false. */
  cache?: boolean
}

export type ServePortfolioSnapshotArgs = {
  asOf: string
  liveOnly: boolean
  scopeKey: string
  allowedClientSlugs: Set<string> | null
  isAdmin: boolean
  refresh: boolean
  readSnapshot: (key: {
    asOfDate: string
    scopeKey: string
    liveOnly: boolean
  }) => Promise<PortfolioSnapshotRecord | null>
  /** Same scope, earlier as-of. Used when today's build fails or is still running. */
  readLatestPrior?: (key: {
    asOfDate: string
    scopeKey: string
    liveOnly: boolean
  }) => Promise<PortfolioSnapshotRecord | null>
  buildAndStore: (args: BuildPortfolioSnapshotArgs) => Promise<PortfolioSnapshotRecord>
  scheduleBuild: (work: () => Promise<void>) => void
}

export type ServePortfolioSnapshotResult =
  | {
      status: 200
      body: {
        asOf: string
        rows: CampaignPacingRow[]
        counts: PortfolioPacingCounts
        generated_at: string
        stale?: { asOf: string; reason: string }
      }
    }
  | { status: 202; body: { building: true } }

function toBody(record: PortfolioSnapshotRecord, stale?: { asOf: string; reason: string }) {
  return {
    asOf: record.asOfDate,
    rows: record.rows,
    counts: record.counts,
    generated_at: record.generatedAt,
    ...(stale ? { stale } : {}),
  }
}

async function staleBody(
  args: ServePortfolioSnapshotArgs,
  reason: string,
): Promise<ServePortfolioSnapshotResult | null> {
  if (!args.readLatestPrior) return null
  const prior = await args.readLatestPrior({
    asOfDate: args.asOf,
    scopeKey: args.scopeKey,
    liveOnly: args.liveOnly,
  })
  if (!prior) return null
  return {
    status: 200,
    body: toBody(prior, { asOf: prior.asOfDate, reason }),
  }
}

function buildArgs(args: ServePortfolioSnapshotArgs): BuildPortfolioSnapshotArgs {
  return {
    asOfDate: args.asOf,
    scopeKey: args.scopeKey,
    liveOnly: args.liveOnly,
    allowedClientSlugs: args.allowedClientSlugs,
  }
}

/**
 * Portfolio GET decision: snapshot hit, admin inline build, or client 202.
 * `refresh` is honoured for admin only.
 */
export async function servePortfolioSnapshot(
  args: ServePortfolioSnapshotArgs
): Promise<ServePortfolioSnapshotResult> {
  const forceRebuild = args.refresh && args.isAdmin
  if (!forceRebuild) {
    const hit = await args.readSnapshot({
      asOfDate: args.asOf,
      scopeKey: args.scopeKey,
      liveOnly: args.liveOnly,
    })
    if (hit) {
      return { status: 200, body: toBody(hit) }
    }
  }

  if (args.isAdmin) {
    try {
      const built = await args.buildAndStore(buildArgs(args))
      return { status: 200, body: toBody(built) }
    } catch (err) {
      const stale = await staleBody(args, "today's build failed")
      if (stale) return stale
      throw err
    }
  }

  args.scheduleBuild(async () => {
    await args.buildAndStore(buildArgs(args))
  })
  const stale = await staleBody(args, "today's pacing is still building")
  if (stale) return stale
  return { status: 202, body: { building: true } }
}
