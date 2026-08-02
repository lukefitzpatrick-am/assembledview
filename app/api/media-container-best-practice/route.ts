import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import {
  getCachedMediaContainerBestPractice,
} from "@/lib/api/mediaContainerBestPracticeCache"
import { createMediaContainerBestPracticePostgresFirst } from "@/lib/data/writeMediaContainerBestPractice"
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

    const body = (await req.json()) as Record<string, unknown>
    const currentUser = await getCurrentUser(req)
    const { row, mirror } = await createMediaContainerBestPracticePostgresFirst({
      ...body,
      _name: currentUser?.email ?? currentUser?.name ?? null,
    })
    return NextResponse.json({ ...row, mirror }, { status: 201 })
  } catch (error) {
    console.error("Failed to create media-container best practice:", error)
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith("Missing required fields")) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    return NextResponse.json(
      { error: "Failed to create media-container best practice", message },
      { status: 500 },
    )
  }
}
