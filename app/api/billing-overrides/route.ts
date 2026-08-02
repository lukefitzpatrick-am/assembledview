import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { readBillingOverridesForVersion } from "@/lib/data/readFinance"

export const dynamic = "force-dynamic"

/**
 * GET /api/billing-overrides?media_plan_version_id=
 * Reads via DATA_BACKEND_FINANCE / DATA_BACKEND.
 * Writes: replace_line / reset_line → Postgres (`writeBillingOverrides`, X2).
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
