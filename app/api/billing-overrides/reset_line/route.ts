import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { getXanoBaseUrl } from "@/lib/api/xano"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"

export const dynamic = "force-dynamic"

const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
const XANO_TIMEOUT_MS = 15_000

/**
 * POST /api/billing-overrides/reset_line
 * Proxies Xano DELETE /billing_overrides/reset_line (body: version + line + optional component).
 * "Reset to auto" for Manual Billing — removes the override row(s).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "JSON body required" }, { status: 400 })
    }

    const b = body as Record<string, unknown>
    const versionId = b.media_plan_version_id ?? b.media_plan_versions_id
    const lineItemId = b.line_item_id ?? b.lineItemId
    if (versionId == null || !lineItemId) {
      return NextResponse.json(
        { error: "media_plan_version_id and line_item_id are required" },
        { status: 400 }
      )
    }

    const payload: Record<string, unknown> = {
      media_plan_version_id: versionId,
      media_plan_version: versionId,
      line_item_id: String(lineItemId),
    }
    if (b.component != null) {
      payload.component =
        String(b.component).toLowerCase() === "fee" ? "fee" : "media"
    }

    const baseUrl = getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])

    // Prefer DELETE; fall back to POST if upstream only exposes POST.
    let response = await axios.delete(`${baseUrl}/billing_overrides/reset_line`, {
      data: payload,
      timeout: XANO_TIMEOUT_MS,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    if (response.status === 404 || response.status === 405) {
      response = await axios.post(`${baseUrl}/billing_overrides/reset_line`, payload, {
        timeout: XANO_TIMEOUT_MS,
        validateStatus: (s) => s >= 200 && s < 500,
      })
    }

    if (response.status >= 400) {
      return NextResponse.json(
        {
          error:
            (response.data as { message?: string })?.message ||
            "reset_line failed upstream",
          upstream: response.data,
        },
        { status: response.status }
      )
    }

    return NextResponse.json({ ok: true, data: response.data })
  } catch (error) {
    console.error("[api/billing-overrides/reset_line POST]", error)
    return NextResponse.json({ error: "Failed to reset billing override line" }, { status: 500 })
  }
}
