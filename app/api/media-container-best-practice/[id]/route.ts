import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { xanoPostHeaderRecord, xanoUrl } from "@/lib/api/xano"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { invalidateMediaContainerBestPracticeCache } from "@/lib/api/mediaContainerBestPracticeCache"
import { requireRole } from "@/lib/requireRole"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // SEC-G / SEC-10: writes are staff-only; keep audit stamp after the gate.
    const gate = await requireRole(req, ["admin"])
    if ("response" in gate) return gate.response

    const { id } = await params
    const body = await req.json()
    const currentUser = await getCurrentUser(req)
    const response = await axios.put(`${xanoUrl("media_container_best_practice", "XANO_PUBLISHERS_BASE_URL")}/${encodeURIComponent(id)}`, {
        ...body,
        _name: currentUser?.email ?? currentUser?.name ?? null,
      }, { headers: xanoPostHeaderRecord() })
    invalidateMediaContainerBestPracticeCache()
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to update media-container best practice:", error)
    return NextResponse.json(
      { error: "Failed to update media-container best practice" },
      { status: 500 },
    )
  }
}
