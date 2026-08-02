import { NextRequest, NextResponse } from "next/server"
import { getCachedPublishersList } from "@/lib/api/publishersCache"
import { createPublisherPostgresFirst } from "@/lib/data/writePublishers"
import { requireRole } from "@/lib/requireRole"

/** Session-auth only (middleware) — reference data for create/edit surfaces. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    // Naming export may need best-practice blobs: ?full=1
    const full = url.searchParams.get("full") === "1"
    const { data, stale } = await getCachedPublishersList({ light: !full })
    const headers: Record<string, string> = {}
    if (stale) headers["x-warning"] = "served-stale-after-upstream-failure"
    return NextResponse.json(data, { headers })
  } catch (error) {
    console.error("Failed to fetch publishers:", error)
    return NextResponse.json({ error: "Failed to fetch publishers" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    // SEC-G / SEC-10: writes are staff-only; GET stays session-auth (reference data).
    const gate = await requireRole(req, ["admin"])
    if ("response" in gate) return gate.response

    const body = (await req.json()) as Record<string, unknown>
    const { row, mirror } = await createPublisherPostgresFirst(body)
    return NextResponse.json({ ...row, mirror }, { status: 201 })
  } catch (error) {
    console.error("Failed to create publisher:", error)
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith("Missing required fields")) {
      const details = message.replace(/^Missing required fields:\s*/, "").split(", ")
      return NextResponse.json(
        { error: "Missing required fields", details },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: "Failed to create publisher", message },
      { status: 500 }
    )
  }
}
