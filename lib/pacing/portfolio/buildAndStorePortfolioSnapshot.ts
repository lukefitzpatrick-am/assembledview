import "server-only"

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
  const rows = await buildCampaignPacingRows({
    asOfDate: args.asOfDate,
    allowedClientSlugs,
    liveOnly: args.liveOnly,
    startedAt: args.startedAt,
  })
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
