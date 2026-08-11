import { NextRequest, NextResponse } from "next/server"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { readBillingOverridesForVersion } from "@/lib/data/readFinance"
import { resolveMbaNumberForVersionId } from "@/lib/data/resolveMbaNumberForVersionId"

export const dynamic = "force-dynamic"

/**
 * GET /api/billing-overrides?media_plan_version_id=
 * Reads via DATA_BACKEND_FINANCE / DATA_BACKEND.
 * Writes: replace_line / reset_line → Postgres (`writeBillingOverrides`, X2).
 * Tenant: MBA derived from version id server-side, then checkClientMbaAccess.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const versionId = request.nextUrl.searchParams.get("media_plan_version_id")
    if (!versionId) {
      return NextResponse.json(
        { error: "media_plan_version_id is required" },
        { status: 400 }
      )
    }

    const mbaNumber = await resolveMbaNumberForVersionId(versionId)
    if (!mbaNumber) {
      return NextResponse.json(
        { error: "Media plan version not found" },
        { status: 404 }
      )
    }
    const access = await checkClientMbaAccess(request, mbaNumber)
    if (!access.ok) return access.response

    const rows = await readBillingOverridesForVersion(versionId)
    const overrides = rows.filter((r) => {
      const candidates = [
        r.media_plan_version,
        r.media_plan_version_id,
        r.media_plan_versions_id,
        r.version_id,
      ]
      return candidates.some((c) => c == null || String(c) === String(versionId))
    })

    return NextResponse.json({ overrides })
  } catch (error) {
    console.error("[api/billing-overrides GET]", error)
    return NextResponse.json({ error: "Failed to load billing overrides" }, { status: 500 })
  }
}
