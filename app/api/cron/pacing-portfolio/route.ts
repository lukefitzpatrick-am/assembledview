import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { pacingScopeKey } from "@/lib/pacing/campaigns/pacingRowsCache"
import { getAsOfDate } from "@/lib/pacing/maths"
import { buildAndStorePortfolioSnapshot } from "@/lib/pacing/portfolio/buildAndStorePortfolioSnapshot"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * Build the admin-scope daily portfolio snapshot for today's Melbourne as-of.
 * Auth: CRON_SECRET. Cron: 0 21 * * * (07:00 Melbourne, after the 06:30 warehouse refresh).
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 }
    )
  }

  const asOfDate = getAsOfDate()
  const liveOnly = true
  const scopeKey = pacingScopeKey(null)

  try {
    const snapshot = await buildAndStorePortfolioSnapshot({
      asOfDate,
      scopeKey,
      liveOnly,
      allowedClientSlugs: null,
    })
    const summary = {
      status: "ok",
      asOfDate: snapshot.asOfDate,
      scopeKey: snapshot.scopeKey,
      liveOnly: snapshot.liveOnly,
      rowCount: snapshot.rows.length,
      durationMs: snapshot.durationMs,
      generatedAt: snapshot.generatedAt,
    }
    console.log(JSON.stringify({ event: "pacing_portfolio_snapshot", ...summary }))
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
