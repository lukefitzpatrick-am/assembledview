import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { pacingScopeKey } from "@/lib/pacing/campaigns/pacingRowsCache"
import { resolveAdminPacingDays } from "@/lib/pacing/countTo"
import { buildAndStorePortfolioSnapshot } from "@/lib/pacing/portfolio/buildAndStorePortfolioSnapshot"
import { readPortfolioSnapshot } from "@/lib/pacing/portfolio/portfolioSnapshotStore"
import { snapshotMatchesCountTo } from "@/lib/pacing/portfolio/servePortfolioSnapshot"
import { runPortfolioCronBuild } from "@/lib/pacing/portfolio/runPortfolioCron"
import { logJob } from "@/lib/log"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * Build the admin-scope daily portfolio snapshot for today's Melbourne as-of.
 * Rows count to Melbourne yesterday (P1, `lib/pacing/countTo.ts`).
 * Auth: CRON_SECRET. Cron: 0 21 * * * — 21:00 UTC (08:00 Melbourne AEDT, 07:00 AEST), after the 06:30 warehouse refresh.
 * Retry: 30 21 * * * with ?retry=1 builds only when today's (as_of, all, live_only) row is missing.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 }
    )
  }

  const { asOfDate, countToDate } = resolveAdminPacingDays()
  const liveOnly = true
  const scopeKey = pacingScopeKey(null)
  const handlerStarted = Date.now()
  const retry = new URL(request.url).searchParams.get("retry") === "1"

  try {
    const action = await runPortfolioCronBuild({
      retry,
      readToday: async () => {
        const today = await readPortfolioSnapshot({ asOfDate, scopeKey, liveOnly })
        // A row built before P1 counted to today; the retry rebuilds it.
        return today && snapshotMatchesCountTo(today, countToDate) ? today : null
      },
      build: () =>
        buildAndStorePortfolioSnapshot({
          asOfDate,
          countToDate,
          scopeKey,
          liveOnly,
          allowedClientSlugs: null,
          startedAt: handlerStarted,
          logPgTimeout: true,
          cache: false,
        }),
    })
    if (action.status === "already built") {
      return NextResponse.json({ status: "already built" })
    }
    const snapshot = action.snapshot
    const summary = {
      status: "ok",
      asOfDate: snapshot.asOfDate,
      scopeKey: snapshot.scopeKey,
      liveOnly: snapshot.liveOnly,
      rowCount: snapshot.rows.length,
      durationMs: snapshot.durationMs,
      generatedAt: snapshot.generatedAt,
    }
    logJob(
      JSON.stringify({
        event: "pacing_portfolio_stage",
        stage: "handler",
        ms: Date.now() - handlerStarted,
        rowCount: snapshot.rows.length,
      }),
    )
    logJob(JSON.stringify({ event: "pacing_portfolio_snapshot", ...summary }))
    return NextResponse.json(summary)
  } catch (err) {
    console.error("[cron/pacing-portfolio] fatal", err)
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
