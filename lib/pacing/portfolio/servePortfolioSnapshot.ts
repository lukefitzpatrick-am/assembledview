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
      }
    }
  | { status: 202; body: { building: true } }

function toBody(record: PortfolioSnapshotRecord) {
  return {
    asOf: record.asOfDate,
    rows: record.rows,
    counts: record.counts,
    generated_at: record.generatedAt,
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
    const built = await args.buildAndStore(buildArgs(args))
    return { status: 200, body: toBody(built) }
  }

  args.scheduleBuild(async () => {
    await args.buildAndStore(buildArgs(args))
  })
  return { status: 202, body: { building: true } }
}
