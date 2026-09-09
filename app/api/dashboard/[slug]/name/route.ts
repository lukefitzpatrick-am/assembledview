import { NextRequest, NextResponse } from "next/server"

import { auth0 } from "@/lib/auth0"
import { isDashboardSlugAllowed } from "@/lib/auth/dashboardSlugAccess"
import { fetchXanoClientRowByUrlSlug } from "@/lib/clients/fetchClientRowByUrlSlug"
import { getClientDisplayName } from "@/lib/clients/slug"
import { getUserClientSlugs, getUserRoles } from "@/lib/rbac"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params

    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }
    const roles = getUserRoles(session.user)
    const tenantSlugs = getUserClientSlugs(session.user)
    // Identical membership check to GET /api/dashboard/[slug] (lines 19–29).
    if (!isDashboardSlugAllowed({ roles, tenantSlugs, slug })) {
      if (!roles.includes("admin") && tenantSlugs.length > 0) {
        console.warn(
          `[dashboard/name] tenant mismatch: caller scoped to [${tenantSlugs.join(",")}] requested slug "${slug}"`,
        )
      }
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const row = await fetchXanoClientRowByUrlSlug(slug)
    if (!row) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }

    return NextResponse.json({ name: getClientDisplayName(row) })
  } catch (error) {
    console.error("Dashboard name API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
