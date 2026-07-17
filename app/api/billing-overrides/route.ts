import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { getXanoBaseUrl, parseXanoListPayload, xanoAuthHeaderRecord, xanoPostHeaderRecord } from "@/lib/api/xano"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"

export const dynamic = "force-dynamic"

const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
const XANO_TIMEOUT_MS = 15_000

/**
 * GET /api/billing-overrides?media_plan_version_id=
 * Proxies Xano GET /billing_overrides.
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

    const baseUrl = getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
    const response = await axios.get(`${baseUrl}/billing_overrides`, { headers: xanoAuthHeaderRecord(), params: {
        media_plan_version_id: versionId,
        page: 1,
        per_page: 500,
      },
      timeout: XANO_TIMEOUT_MS,
      validateStatus: (s) => s >= 200 && s < 500, })

    if (response.status === 404) {
      return NextResponse.json({ overrides: [] })
    }
    if (response.status >= 400) {
      return NextResponse.json(
        { error: "Failed to load billing overrides", upstream: response.data },
        { status: response.status }
      )
    }

    const rows = parseXanoListPayload(response.data)
    const overrides = rows.filter((r: Record<string, unknown>) => {
      const candidates = [
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
