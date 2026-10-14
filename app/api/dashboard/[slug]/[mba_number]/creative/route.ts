import { NextRequest, NextResponse } from "next/server"

import { auth0 } from "@/lib/auth0"
import { isCreativePerformanceEnabled } from "@/lib/creative/performance/featureFlag"
import { getCreativePerformance } from "@/lib/creative/performance/getCreativePerformance"
import type { RankMetric } from "@/lib/creative/performance/metrics"
import { isMissingCreativePerformanceView } from "@/lib/creative/performance/missingView"
import { checkCreativePerformanceRateLimit } from "@/lib/creative/performance/rateLimit"
import { parseIsoDateOnlyStrict } from "@/lib/dashboard/campaignDateRange"
import { getPrimaryRole, getUserClientSlugs, getUserMbaNumbers } from "@/lib/rbac"

export const dynamic = "force-dynamic"

const SORTS = new Set<RankMetric>(["impressions", "ctr", "vcr"])

function notFound() {
  return NextResponse.json({ error: "not found" }, { status: 404 })
}

/**
 * Campaign-page gate: a client sees only their own slugs, and only their MBA
 * list when that list is non-empty. Empty MBA list means every MBA on the slug.
 * Other roles are not slug-gated. Flag off is 404 for every role.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; mba_number: string }> },
) {
  const { slug, mba_number } = await ctx.params
  if (!isCreativePerformanceEnabled(slug)) return notFound()

  const session = await auth0.getSession(req)
  const user = session?.user
  if (!user) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  }

  if (getPrimaryRole(user) === "client") {
    const userClientSlugs = getUserClientSlugs(user)
    if (userClientSlugs.length === 0 || !userClientSlugs.includes(slug.toLowerCase())) {
      return notFound()
    }
    const userMbaNumbers = getUserMbaNumbers(user)
    if (userMbaNumbers.length > 0) {
      const mbaMatches = userMbaNumbers.some(
        (mba) => mba.toLowerCase() === mba_number.toLowerCase(),
      )
      if (!mbaMatches) return notFound()
    }
  }

  const sessionKey = String(user.sub || user.email || "anonymous")
  const limit = checkCreativePerformanceRateLimit(sessionKey)
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many creative requests. Try again in a minute.",
      },
      { status: 429 },
    )
  }

  const params = req.nextUrl.searchParams
  const from = parseIsoDateOnlyStrict(params.get("from"))
  const to = parseIsoDateOnlyStrict(params.get("to"))
  if (!from || !to || from > to) {
    return NextResponse.json(
      { error: "from and to are required (YYYY-MM-DD)" },
      { status: 400 },
    )
  }
  const sortRaw = (params.get("sort") ?? "impressions").trim().toLowerCase()
  if (!SORTS.has(sortRaw as RankMetric)) {
    return NextResponse.json(
      { error: "sort must be impressions, ctr, or vcr" },
      { status: 400 },
    )
  }
  const sort = sortRaw as RankMetric

  try {
    const creatives = await getCreativePerformance({
      mbaNumber: mba_number,
      from,
      to,
      sort,
    })
    return NextResponse.json({ mbaNumber: mba_number, from, to, sort, creatives })
  } catch (err) {
    if (isMissingCreativePerformanceView(err)) {
      console.warn(
        "[creative-performance] view not available:",
        err instanceof Error ? err.message : err,
      )
      return NextResponse.json({ error: "Creative data not set up yet" }, { status: 503 })
    }
    console.error("[creative-performance]", err)
    return NextResponse.json({ error: "Creative performance failed" }, { status: 500 })
  }
}
