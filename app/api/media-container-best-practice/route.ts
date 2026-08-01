import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { xanoPostHeaderRecord, xanoUrl } from "@/lib/api/xano"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import {
  getCachedMediaContainerBestPractice,
  invalidateMediaContainerBestPracticeCache,
} from "@/lib/api/mediaContainerBestPracticeCache"
import { requireRole } from "@/lib/requireRole"

/** Session-auth only (middleware) — reference data for create/edit surfaces. */
export async function GET() {
  try {
    const { data, stale } = await getCachedMediaContainerBestPractice()
    const headers: Record<string, string> = {}
    if (stale) headers["x-warning"] = "served-stale-after-upstream-failure"
    return NextResponse.json(data, { headers })
  } catch (error) {
    console.error("Failed to fetch media-container best practices:", error)
    return NextResponse.json(
      { error: "Failed to fetch media-container best practices" },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    // SEC-G / SEC-10: writes are staff-only; keep audit stamp after the gate.
    const gate = await requireRole(req, ["admin"])
    if ("response" in gate) return gate.response

    const body = await req.json()
    const currentUser = await getCurrentUser(req)
    const response = await axios.post(xanoUrl("media_container_best_practice", "XANO_PUBLISHERS_BASE_URL"), {
        ...body,
        _name: currentUser?.email ?? currentUser?.name ?? null,
      }, { headers: xanoPostHeaderRecord() })
    invalidateMediaContainerBestPracticeCache()
    return NextResponse.json(response.data, { status: 201 })
  } catch (error) {
    console.error("Failed to create media-container best practice:", error)
    return NextResponse.json(
      { error: "Failed to create media-container best practice" },
      { status: 500 },
    )
  }
}
