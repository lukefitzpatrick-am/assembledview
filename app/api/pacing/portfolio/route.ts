import { after } from "next/server"
import { NextRequest, NextResponse } from "next/server"

import { pacingScopeKey } from "@/lib/pacing/campaigns/pacingRowsCache"
import { requirePacingAccess } from "@/lib/pacing/pacingAuth"
import { buildAndStorePortfolioSnapshot } from "@/lib/pacing/portfolio/buildAndStorePortfolioSnapshot"
import { readPortfolioSnapshot } from "@/lib/pacing/portfolio/portfolioSnapshotStore"
import { servePortfolioSnapshot } from "@/lib/pacing/portfolio/servePortfolioSnapshot"
import { resolveClientSlugs } from "@/lib/pacing/scope/resolveClientSlugs"
import { getAsOfDate } from "@/lib/pacing/maths"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * GET /api/pacing/portfolio
 *
 * Serves the daily snapshot for (asOf, scope_key, liveOnly).
 * Query: asOfDate?, liveOnly? (default true), refresh=1 (admin only)
 */
export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const url = new URL(request.url)
  const asOfDateParam = url.searchParams.get("asOfDate")
  const asOf = asOfDateParam?.trim() || getAsOfDate()
  const liveOnlyParam = url.searchParams.get("liveOnly")
  const liveOnly = liveOnlyParam == null ? true : liveOnlyParam !== "false"
  const refresh = url.searchParams.get("refresh") === "1"
  const isAdmin = gate.allowedClientIds === null

  const allowedClientSlugs =
    gate.allowedClientIds === null
      ? null
      : new Set(await resolveClientSlugs(gate.allowedClientIds))
  const scopeKey = pacingScopeKey(allowedClientSlugs)

  try {
    const result = await servePortfolioSnapshot({
      asOf,
      liveOnly,
      scopeKey,
      allowedClientSlugs,
      isAdmin,
      refresh,
      readSnapshot: readPortfolioSnapshot,
      buildAndStore: buildAndStorePortfolioSnapshot,
      scheduleBuild: (work) => {
        after(() => {
          void work().catch((err) => {
            console.error("[api/pacing/portfolio] background build failed", err)
          })
        })
      },
    })
    return NextResponse.json(result.body, { status: result.status })
  } catch (err) {
    console.error("[api/pacing/portfolio] failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
