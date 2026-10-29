import { NextRequest, NextResponse } from "next/server"

import { auth0 } from "@/lib/auth0"
import { parseIsoDateOnlyStrict } from "@/lib/dashboard/campaignDateRange"
import { getUserClientSlugs, getUserRoles, hasRole } from "@/lib/rbac"
import { isWebSearchFlagOn, webSearchFlagBlocks } from "@/lib/webReport/featureFlag"
import { isWebReportPublished } from "@/lib/webReport/visibility"
import { loadWebReportResponse, WebReportRangeError } from "@/lib/webReport/loadPage"
import { isReportPeriod } from "@/lib/webReport/periods"

export const dynamic = "force-dynamic"

/**
 * Client Web & search report. Same client gate as the client dashboard page:
 * a client sees only their own slug, and only once the report is published.
 * Flag off is 404 for clients only. Admins get the report, as on the page.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }
    if (webSearchFlagBlocks({ isAdmin: hasRole(session.user, ["admin"]), flagOn: await isWebSearchFlagOn() })) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }
    const roles = getUserRoles(session.user)
    const tenantSlugs = getUserClientSlugs(session.user)
    if (roles[0] === "client" && !tenantSlugs.includes(slug.toLowerCase())) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }
    if (roles[0] === "client" && !(await isWebReportPublished(slug))) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }

    const periodParam = request.nextUrl.searchParams.get("period")
    if (periodParam && !isReportPeriod(periodParam)) {
      return NextResponse.json({ error: "bad period" }, { status: 400 })
    }
    const fromParam = request.nextUrl.searchParams.get("from")
    const toParam = request.nextUrl.searchParams.get("to")
    const from = fromParam ? parseIsoDateOnlyStrict(fromParam) : null
    const to = toParam ? parseIsoDateOnlyStrict(toParam) : null
    if ((fromParam && !from) || (toParam && !to) || (Boolean(from) !== Boolean(to))) {
      return NextResponse.json({ error: "bad date range" }, { status: 400 })
    }

    const report = await loadWebReportResponse({ slug, period: periodParam, from, to })
    if (!report) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }
    return NextResponse.json(report)
  } catch (error) {
    if (error instanceof WebReportRangeError) {
      return NextResponse.json({ error: "bad date range" }, { status: 400 })
    }
    console.error("[dashboard/web-report] error", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
