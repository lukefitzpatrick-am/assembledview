import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import {
  BillingOverrideWriteError,
  replaceBillingOverrideLine,
} from "@/lib/data/writeBillingOverrides"

export const dynamic = "force-dynamic"

/**
 * POST /api/billing-overrides/replace_line
 * Upserts `billing_overrides` in Postgres (X2 — Xano replace_line retired).
 * Body: { media_plan_version_id, mba_number, line_item_id, component, months, date_basis, mode?, reason? }
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
    const component =
      String(b.component ?? "media").toLowerCase() === "fee" ? "fee" : "media"
    const months = b.months
    const dateBasis = b.date_basis ?? b.dateBasis

    if (versionId == null || !lineItemId || !Array.isArray(months) || !dateBasis) {
      return NextResponse.json(
        {
          error:
            "media_plan_version_id, line_item_id, months[], and date_basis are required",
        },
        { status: 400 }
      )
    }

    if (!mbaNumber) {
      return NextResponse.json(
        { error: "mba_number is required for replace_line" },
        { status: 400 }
      )
    }

    const data = await replaceBillingOverrideLine({
      versionId: Number(versionId),
      mbaNumber,
      lineItemId: String(lineItemId),
      component,
      months,
      dateBasis: String(dateBasis),
      mode: b.mode != null ? String(b.mode) : "manual",
      reason: b.reason != null ? String(b.reason) : "manual",
    })

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    if (error instanceof BillingOverrideWriteError) {
      const status =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "SUM_VIOLATION" ||
              error.code === "VERSION_PUBLISHED_IMMUTABLE"
            ? 409
            : 400
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          ...(error.delta != null ? { delta: error.delta } : {}),
          ...(error.expected != null ? { expected: error.expected } : {}),
          ...(error.actual != null ? { actual: error.actual } : {}),
        },
        { status }
      )
    }
    console.error("[api/billing-overrides/replace_line POST]", error)
    return NextResponse.json({ error: "Failed to replace billing override line" }, { status: 500 })
  }
}
