import { NextResponse } from "next/server"
import axios from "axios"
import { getXanoBaseUrl } from "@/lib/api/xano"
import { clearRelevantPlanVersionsCache } from "@/lib/finance/relevantPlanVersions"

const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: "Missing version id" }, { status: 400 })
    }

    let mediaPlansBaseUrl: string
    try {
      mediaPlansBaseUrl = getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
    } catch {
      return NextResponse.json(
        { error: "XANO_MEDIA_PLANS_BASE_URL (or XANO_MEDIAPLANS_BASE_URL) is not configured" },
        { status: 500 }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object" || !("billingSchedule" in body)) {
      return NextResponse.json(
        { error: "Request body must include billingSchedule" },
        { status: 400 }
      )
    }

    const { billingSchedule } = body as { billingSchedule: unknown }

    const xanoResponse = await axios.patch(
      `${mediaPlansBaseUrl}/media_plan_versions/${encodeURIComponent(id)}`,
      { billingSchedule }
    )

    clearRelevantPlanVersionsCache()

    return NextResponse.json({ ok: true, data: xanoResponse.data })
  } catch (error) {
    const message =
      (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data
        ?.message ||
      (error as { message?: string })?.message ||
      "Failed to patch billing schedule"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
