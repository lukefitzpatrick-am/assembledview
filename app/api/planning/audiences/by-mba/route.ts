import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { toClientSafePlannedAudience } from "@/lib/planning/clientSafeAudience"
import {
  listPlanningAudiencesByMba,
  XanoPlanningAudienceError,
} from "@/lib/planning/xanoPlanningAudiences"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/planning/audiences/by-mba?mba_number=
 * Session required. Client role → checkClientMbaAccess + client_visible only.
 * Staff → all rows for the MBA (includes client_visible for preview chips).
 * Response is whitelist-shaped (no definition_json / budget / benches / params).
 */
export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  }

  const mbaNumber = request.nextUrl.searchParams.get("mba_number")?.trim() ?? ""
  if (!mbaNumber) {
    return NextResponse.json({ error: "mba_number is required" }, { status: 400 })
  }

  const access = await checkClientMbaAccess(request, mbaNumber)
  if (!access.ok) return access.response

  try {
    const rows = await listPlanningAudiencesByMba(mbaNumber)
    const visibleRows = access.isClient
      ? rows.filter((r) => Boolean(r.client_visible))
      : rows

    const payload = await Promise.all(
      visibleRows.map((row) => toClientSafePlannedAudience(row))
    )

    return NextResponse.json({ audiences: payload })
  } catch (error) {
    if (error instanceof XanoPlanningAudienceError) {
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    console.error("[api/planning/audiences/by-mba]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
