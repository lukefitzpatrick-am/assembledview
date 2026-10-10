import "server-only"

import { logJob } from "@/lib/log"
import { pacingScopeKey } from "@/lib/pacing/campaigns/pacingRowsCache"
import { buildCampaignPacingRows } from "@/lib/pacing/portfolio/buildCampaignPacingRows"
import { countPortfolioRows } from "@/lib/pacing/portfolio/portfolioRowFlags"
import { upsertPortfolioSnapshot } from "@/lib/pacing/portfolio/portfolioSnapshotStore"
import type { BuildPortfolioSnapshotArgs } from "@/lib/pacing/portfolio/servePortfolioSnapshot"
import type { PortfolioSnapshotRecord } from "@/lib/pacing/portfolio/servePortfolioSnapshot"

export async function buildAndStorePortfolioSnapshot(
  args: BuildPortfolioSnapshotArgs
): Promise<PortfolioSnapshotRecord> {
  const started = Date.now()
  const allowedClientSlugs = args.allowedClientSlugs
  const scopeKey = args.scopeKey || pacingScopeKey(allowedClientSlugs)
  const rowsStarted = Date.now()
  const built = await buildCampaignPacingRows({
    asOfDate: args.asOfDate,
    allowedClientSlugs,
    liveOnly: args.liveOnly,
    startedAt: args.startedAt,
    perSourceTimeoutMs: args.perSourceTimeoutMs,
  })
  const rows = built.rows
  console.log(
    JSON.stringify({
      event: "pacing_portfolio_stage",
      stage: "build_rows",
      ms: Date.now() - rowsStarted,
      rowCount: rows.length,
      asOfDate: args.asOfDate,
      scopeKey,
    }),
  )
  const counts = countPortfolioRows(rows)
  warnWhenLiveCountIsLow({
    asOfDate: args.asOfDate,
    scopeKey,
    countsLive: counts.live,
    expectedLiveIds: built.expectedLiveIds,
    storedIds: rows.map((row) => row.mbaNumber),
    unscoped: allowedClientSlugs === null,
  })
  const durationMs = Date.now() - started
  const upsertStarted = Date.now()
  const stored = await upsertPortfolioSnapshot({
    asOfDate: args.asOfDate,
    scopeKey,
    liveOnly: args.liveOnly,
    rows,
    counts,
    durationMs,
  })
  console.log(
    JSON.stringify({
      event: "pacing_portfolio_stage",
      stage: "upsert",
      ms: Date.now() - upsertStarted,
      durationMs,
    }),
  )
  return stored
}

function normMba(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Versions have no client name, so a scoped snapshot cannot be compared with
 * the unscoped versions read. The warning is for the unscoped build only.
 * It does not block the upsert.
 */
function warnWhenLiveCountIsLow(input: {
  asOfDate: string
  scopeKey: string
  countsLive: number
  expectedLiveIds: string[]
  storedIds: string[]
  unscoped: boolean
}): void {
  if (!input.unscoped) return
  if (input.countsLive >= input.expectedLiveIds.length) return
  const stored = new Set(input.storedIds.map(normMba))
  const missing = input.expectedLiveIds.filter((id) => !stored.has(normMba(id)))
  logJob(
    JSON.stringify({
      event: "pacing_portfolio_live_count_low",
      asOfDate: input.asOfDate,
      scopeKey: input.scopeKey,
      counts: { live: input.countsLive },
      expectedLive: input.expectedLiveIds.length,
      missingCampaignIds: missing.slice(0, 20),
    }),
  )
}
