import { NextRequest, NextResponse } from "next/server"
import { requirePacingAccess } from "@/lib/pacing/pacingAuth"
import { resolveClientSlugs } from "@/lib/pacing/scope/resolveClientSlugs"
import { getCachedPortfolioPacingRows } from "@/lib/pacing/campaigns/pacingRowsCache"
import { countPortfolioRows } from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import { getAsOfDate } from "@/lib/pacing/maths"

export const dynamic = "force-dynamic"
export const maxDuration = 90

/**
 * GET /api/pacing/portfolio
 *
 * One campaign-level pacing row per live campaign, channels nested.
 * Query: asOfDate?, liveOnly? (default true)
 */
export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const url = new URL(request.url)
  const asOfDateParam = url.searchParams.get("asOfDate")
  const asOf = asOfDateParam?.trim() || getAsOfDate()
  const liveOnlyParam = url.searchParams.get("liveOnly")
  const liveOnly = liveOnlyParam == null ? true : liveOnlyParam !== "false"

  const allowedClientSlugs =
    gate.allowedClientIds === null
      ? null
      : new Set(await resolveClientSlugs(gate.allowedClientIds))

  try {
    const rows = await getCachedPortfolioPacingRows(asOf, allowedClientSlugs, liveOnly)
    return NextResponse.json({
      asOf,
      rows,
      counts: countPortfolioRows(rows),
    })
  } catch (err) {
    console.error("[api/pacing/portfolio] failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
