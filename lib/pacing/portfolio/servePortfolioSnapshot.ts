import type { DirectDigitalFeePctsLoader } from "@/lib/delivery/directDigitalFeeLookup"
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
  /** Last day counted (P1). Unset counts to `asOfDate`. */
  countToDate?: string
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
  /** Unset calls `loadDirectDigitalFeePcts`. Tests pass a stub. */
  loadFeePcts?: DirectDigitalFeePctsLoader
}

export type ServePortfolioSnapshotArgs = {
  asOf: string
  /**
   * Last day counted (P1). When set, a stored row for `asOf` that was not
   * counted to this day is treated as out of date: admin rebuilds it, a
   * client read is served it as stale while a build is scheduled.
   */
  countToDate?: string
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
        /** Last day counted, when the stored rows carry it. */
        countTo?: string
        stale?: { asOf: string; reason: string }
      }
    }
  | { status: 202; body: { building: true } }

/** The count-to day every stored row carries, or null when they differ or lack it. */
export function snapshotCountTo(record: PortfolioSnapshotRecord): string | null {
  const first = record.rows[0]?.countToDate
  if (!first) return null
  return record.rows.every((row) => row.countToDate === first) ? first : null
}

/** True when the record was counted to `countToDate`, or no count-to day is asked for. */
export function snapshotMatchesCountTo(
  record: PortfolioSnapshotRecord,
  countToDate: string | undefined,
): boolean {
  if (!countToDate) return true
  if (record.rows.length === 0) return true
  return snapshotCountTo(record) === countToDate
}

function toBody(record: PortfolioSnapshotRecord, stale?: { asOf: string; reason: string }) {
  const countTo = snapshotCountTo(record)
  return {
    asOf: record.asOfDate,
    rows: record.rows,
    counts: record.counts,
    generated_at: record.generatedAt,
    ...(countTo ? { countTo } : {}),
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
    ...(args.countToDate ? { countToDate: args.countToDate } : {}),
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
  let outdated: PortfolioSnapshotRecord | null = null
  if (!forceRebuild) {
    const hit = await args.readSnapshot({
      asOfDate: args.asOf,
      scopeKey: args.scopeKey,
      liveOnly: args.liveOnly,
    })
    if (hit && snapshotMatchesCountTo(hit, args.countToDate)) {
      return { status: 200, body: toBody(hit) }
    }
    // Built before P1 (counted to its as-of day): rebuild, serve it only as stale.
    if (hit) outdated = hit
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
  if (outdated) {
    return {
      status: 200,
      body: toBody(outdated, { asOf: outdated.asOfDate, reason: "today's pacing is still building" }),
    }
  }
  const stale = await staleBody(args, "today's pacing is still building")
  if (stale) return stale
  return { status: 202, body: { building: true } }
}
