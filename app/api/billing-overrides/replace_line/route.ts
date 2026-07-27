import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { getXanoBaseUrl, xanoAuthHeaderRecord, xanoPostHeaderRecord } from "@/lib/api/xano"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"

export const dynamic = "force-dynamic"

const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
const XANO_TIMEOUT_MS = 15_000

/**
 * Resolve audit identity for Xano `created_by` (text field — stores stringified
 * values). Prefer email; fall back to display name / Auth0 sub; never invent a
 * silent empty string that Xano rejects as Missing param.
 */
function resolveCreatedBy(user: {
  id: number
  name?: string | null
  email?: string | null
}): string | null {
  const email = typeof user.email === "string" ? user.email.trim() : ""
  if (email) return email
  const name = typeof user.name === "string" ? user.name.trim() : ""
  if (name) return name
  // Numeric id is last resort (often 0 when Auth0 has no users_id claim).
  if (user.id != null && Number.isFinite(user.id)) return String(user.id)
  return null
}

/**
 * POST /api/billing-overrides/replace_line
 * Proxies Xano POST /billing_overrides/replace_line
 * Body: { media_plan_version_id, mba_number, line_item_id, component: 'media'|'fee', months, date_basis, mode?, reason? }
 * Server attaches `created_by` from the authenticated session.
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
    const component = String(b.component ?? "media").toLowerCase() === "fee" ? "fee" : "media"
    const months = b.months
    const dateBasis = b.date_basis ?? b.dateBasis
    const createdBy = resolveCreatedBy(user)

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

    if (!createdBy) {
      return NextResponse.json(
        { error: "created_by could not be resolved from the authenticated session" },
        { status: 400 }
      )
    }

    const payload = {
      media_plan_version_id: versionId,
      media_plan_version: versionId,
      mba_number: mbaNumber,
      line_item_id: String(lineItemId),
      component,
      mode: b.mode ?? "manual",
      reason: b.reason ?? "manual",
      months,
      date_basis: String(dateBasis),
      dateBasis: String(dateBasis),
      created_by: createdBy,
    }

    const baseUrl = getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
    const response = await axios.post(`${baseUrl}/billing_overrides/replace_line`, payload, { headers: xanoPostHeaderRecord(), timeout: XANO_TIMEOUT_MS,
      validateStatus: (s) => s >= 200 && s < 500, })

    if (response.status >= 400) {
      return NextResponse.json(
        {
          error:
            (response.data as { message?: string })?.message ||
            "replace_line failed upstream",
          upstream: response.data,
        },
        { status: response.status }
      )
    }

    return NextResponse.json({ ok: true, data: response.data })
  } catch (error) {
    console.error("[api/billing-overrides/replace_line POST]", error)
    return NextResponse.json({ error: "Failed to replace billing override line" }, { status: 500 })
  }
}
