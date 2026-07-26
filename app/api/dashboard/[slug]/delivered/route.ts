import { NextRequest, NextResponse } from "next/server"

import { auth0 } from "@/lib/auth0"
import { getUserRoles, getUserClientSlugs } from "@/lib/rbac"
import { getClientDashboardData } from "@/lib/api/dashboard"
import { isPlannedBasisCampaignStatus } from "@/lib/dashboard/plannedSpendConsistency"
import { getDeliveredTotalsForClient } from "@/lib/delivery/getDeliveredTotalsForClient"

/**
 * Client KPI bar "Delivered" tile (Task 3). Aggregates delivered spend/impressions across the
 * SAME booked/approved/completed campaign set used by `computePlannedSpendTotals` (Task 2) so
 * "Planned to date" and "Delivered" are directly comparable.
 *
 * Tenant scoping copied verbatim from `/api/dashboard/[slug]/route.ts` — same session, role and
 * slug checks. Kept as a separate endpoint (not baked into `getClientDashboardData`) so the
 * (Snowflake-backed, slower) delivered read never blocks the main dashboard SSR paint.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params

    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }
    const roles = getUserRoles(session.user)
    const tenantSlugs = getUserClientSlugs(session.user)
    const unscoped = roles.includes("admin")
    const slugKey = slug.toLowerCase()
    if (!unscoped && tenantSlugs.length === 0) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
    if (!unscoped && !tenantSlugs.some((s) => s.toLowerCase() === slugKey)) {
      console.warn(
        `[dashboard/delivered] tenant mismatch: caller scoped to [${tenantSlugs.join(",")}] requested slug "${slug}"`,
      )
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const dashboardData = await getClientDashboardData(slug)
    if (!dashboardData) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    const allCampaigns = [
      ...dashboardData.liveCampaignsList,
      ...dashboardData.planningCampaignsList,
      ...dashboardData.completedCampaignsList,
    ]
    const inScope = allCampaigns.filter((c) => isPlannedBasisCampaignStatus(c.status))

    const totals = await getDeliveredTotalsForClient(
      inScope.map((c) => ({
        mbaNumber: c.mbaNumber,
        versionNumber: Number.isFinite(c.version_number) ? c.version_number : undefined,
        mediaTypes: c.mediaTypes,
      })),
    )

    return NextResponse.json(totals)
  } catch (error) {
    console.error("[dashboard/delivered] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
