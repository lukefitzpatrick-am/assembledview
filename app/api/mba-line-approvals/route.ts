import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { getXanoBaseUrl, parseXanoListPayload } from "@/lib/api/xano"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"

export const dynamic = "force-dynamic"

const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
const XANO_TIMEOUT_MS = 15_000

/**
 * GET /api/mba-line-approvals?mba_number=&media_plan_version=
 * Proxies Xano GET /mba_line_approvals. Absence of rows = all approved.
 * 404 upstream → { lines: [], available: false } (fail-soft).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const mbaNumber = request.nextUrl.searchParams.get("mba_number")
    const version = request.nextUrl.searchParams.get("media_plan_version")
    if (!mbaNumber || version == null || String(version).trim() === "") {
      return NextResponse.json(
        { error: "mba_number and media_plan_version are required" },
        { status: 400 }
      )
    }

    const baseUrl = getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
    const response = await axios.get(`${baseUrl}/mba_line_approvals`, {
      params: {
        mba_number: mbaNumber,
        media_plan_version: version,
      },
      timeout: XANO_TIMEOUT_MS,
      validateStatus: (s) => s >= 200 && s < 500,
    })

    if (response.status === 404) {
      return NextResponse.json({ lines: [], available: false })
    }
    if (response.status >= 400) {
      return NextResponse.json(
        {
          error: "Failed to load mba_line_approvals",
          upstream: response.data,
          available: false,
        },
        { status: response.status }
      )
    }

    const rows = parseXanoListPayload(response.data)
    return NextResponse.json({ lines: rows, available: true })
  } catch (error) {
    console.error("[api/mba-line-approvals GET]", error)
    return NextResponse.json(
      { lines: [], available: false, error: "Failed to load mba_line_approvals" },
      { status: 200 }
    )
  }
}

/**
 * PATCH /api/mba-line-approvals
 * Body: { mba_number, media_plan_version, lines:[{ line_item_id, media_type, approved }] }
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body?.mba_number || body.media_plan_version == null) {
      return NextResponse.json(
        { error: "mba_number and media_plan_version are required" },
        { status: 400 }
      )
    }
    if (!Array.isArray(body.lines)) {
      return NextResponse.json({ error: "lines array is required" }, { status: 400 })
    }

    const baseUrl = getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
    const response = await axios.patch(
      `${baseUrl}/mba_line_approvals`,
      {
        mba_number: body.mba_number,
        media_plan_version: body.media_plan_version,
        lines: body.lines,
      },
      {
        timeout: XANO_TIMEOUT_MS,
        validateStatus: (s) => s >= 200 && s < 500,
      }
    )

    if (response.status === 404) {
      return NextResponse.json(
        { error: "Approvals API unavailable", available: false },
        { status: 404 }
      )
    }
    if (response.status >= 400) {
      return NextResponse.json(
        { error: "Failed to patch mba_line_approvals", upstream: response.data },
        { status: response.status }
      )
    }

    return NextResponse.json({ ok: true, available: true, data: response.data })
  } catch (error) {
    console.error("[api/mba-line-approvals PATCH]", error)
    return NextResponse.json(
      { error: "Failed to patch mba_line_approvals", available: false },
      { status: 500 }
    )
  }
}
