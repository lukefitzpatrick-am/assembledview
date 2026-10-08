import { NextRequest, NextResponse } from "next/server"

import { auth0 } from "@/lib/auth0"
import { assertClientAccess, clientIdFromRow } from "@/lib/auth/assertClientAccess"
import { isDashboardSlugAllowed } from "@/lib/auth/dashboardSlugAccess"
import { fetchXanoClientRowByUrlSlug } from "@/lib/clients/fetchClientRowByUrlSlug"
import {
  isClientInvoicesEnabled,
  loadClientInvoicesForClient,
} from "@/lib/finance/invoices/clientInvoices"
import { getUserClientSlugs, getUserRoles } from "@/lib/rbac"

/**
 * FY26+ Xero invoices for the dashboard client.
 * Admins may read any slug. A client-role caller must pass the dashboard slug
 * gate and assertClientAccess. CLIENT_INVOICES_ENABLED defaults off: while it
 * is off, a client-role caller gets 404 and an admin is unaffected.
 */
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
    const isAdmin = roles.includes("admin")
    const isClient = roles.includes("client")

    if (isClient && !isAdmin && !isClientInvoicesEnabled()) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }

    const tenantSlugs = getUserClientSlugs(session.user)
    if (!isDashboardSlugAllowed({ roles, tenantSlugs, slug })) {
      if (!isAdmin && tenantSlugs.length > 0) {
        console.warn(
          `[dashboard/invoices] tenant mismatch: caller scoped to [${tenantSlugs.join(",")}] requested slug "${slug}"`,
        )
      }
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const row = await fetchXanoClientRowByUrlSlug(slug)
    const clientId = clientIdFromRow(row)
    if (clientId == null) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }

    const access = await assertClientAccess(request, clientId)
    if (!access.ok) return access.response

    const payload = await loadClientInvoicesForClient(clientId)
    return NextResponse.json(payload)
  } catch (error) {
    console.error("[dashboard/invoices] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
