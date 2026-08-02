import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import {
  BillingOverrideWriteError,
  resetBillingOverrideLine,
} from "@/lib/data/writeBillingOverrides"

export const dynamic = "force-dynamic"

/**
 * POST /api/billing-overrides/reset_line
 * Deletes `billing_overrides` row(s) in Postgres (X2 — Xano reset_line retired).
 * Body: { media_plan_version_id, mba_number, line_item_id, component? }
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
    const mbaNumberRaw = b.mba_number ?? b.mbaNumber
    const mbaNumber =
      mbaNumberRaw != null && String(mbaNumberRaw).trim() !== ""
        ? String(mbaNumberRaw).trim()
        : ""

    if (versionId == null || !lineItemId) {
      return NextResponse.json(
        { error: "media_plan_version_id and line_item_id are required" },
        { status: 400 }
      )
    }

    if (!mbaNumber) {
      return NextResponse.json(
        { error: "mba_number is required for reset_line" },
        { status: 400 }
      )
    }

    const component =
      b.component != null
        ? String(b.component).toLowerCase() === "fee"
          ? ("fee" as const)
          : ("media" as const)
        : null

    const data = await resetBillingOverrideLine({
      versionId: Number(versionId),
      mbaNumber,
      lineItemId: String(lineItemId),
      component,
    })

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    if (error instanceof BillingOverrideWriteError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400
      return NextResponse.json({ error: error.message }, { status })
    }
    console.error("[api/billing-overrides/reset_line POST]", error)
    return NextResponse.json({ error: "Failed to reset billing override line" }, { status: 500 })
  }
}
