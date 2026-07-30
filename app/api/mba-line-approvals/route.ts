import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { readMbaLineApprovals } from "@/lib/data/readApprovals"
import { writeMbaLineApprovals } from "@/lib/data/writeApprovals"

export const dynamic = "force-dynamic"

/**
 * GET /api/mba-line-approvals?mba_number=&media_plan_version=
 * DATA_BACKEND_APPROVALS / DATA_BACKEND switch (default xano).
 * Absence of rows = all approved. 404 upstream → { lines: [], available: false }.
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

    const mediaPlanVersion = Number(version)
    if (!Number.isFinite(mediaPlanVersion)) {
      return NextResponse.json(
        { error: "media_plan_version must be a number" },
        { status: 400 }
      )
    }

    const result = await readMbaLineApprovals(mbaNumber, mediaPlanVersion)
    if (!result.available) {
      return NextResponse.json({
        lines: [],
        available: false,
        ...(result.error ? { error: result.error } : {}),
      })
    }
    return NextResponse.json({ lines: result.lines, available: true })
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
 * Writes follow WRITE_BACKEND (default xano).
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

    const result = await writeMbaLineApprovals({
      mbaNumber: String(body.mba_number),
      mediaPlanVersion: Number(body.media_plan_version),
      lines: body.lines,
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          available: false,
          ...(result.upstream !== undefined ? { upstream: result.upstream } : {}),
        },
        { status: result.status }
      )
    }

    return NextResponse.json({ ok: true, available: true, data: result.data })
  } catch (error) {
    console.error("[api/mba-line-approvals PATCH]", error)
    return NextResponse.json(
      { error: "Failed to patch mba_line_approvals", available: false },
      { status: 500 }
    )
  }
}
