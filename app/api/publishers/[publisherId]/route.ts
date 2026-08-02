import { NextRequest, NextResponse } from "next/server"
import { getPublisherByPublisherId } from "@/lib/api/publishers"
import {
  updatePublisherPostgresFirst,
} from "@/lib/data/writePublishers"
import { requireRole } from "@/lib/requireRole"

/** Session-auth only (middleware) — reference data for create/edit surfaces. */
export async function GET(_req: Request, { params }: { params: Promise<{ publisherId: string }> }) {
  try {
    const { publisherId } = await params
    const publisher = await getPublisherByPublisherId(publisherId)
    if (!publisher) {
      return NextResponse.json({ error: "Publisher not found" }, { status: 404 })
    }
    return NextResponse.json(publisher)
  } catch (error) {
    console.error("Failed to fetch publisher:", error)
    return NextResponse.json({ error: "Failed to fetch publisher" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ publisherId: string }> }) {
  try {
    // SEC-G / SEC-10: writes are staff-only; GET stays session-auth (reference data).
    const gate = await requireRole(req, ["admin"])
    if ("response" in gate) return gate.response

    const { publisherId } = await params
    const body = (await req.json()) as Record<string, unknown>
    const result = await updatePublisherPostgresFirst(publisherId, body)
    if ("notFound" in result) {
      return NextResponse.json({ error: "Publisher not found" }, { status: 404 })
    }
    return NextResponse.json({ ...result.row, mirror: result.mirror })
  } catch (error) {
    console.error("Failed to update publisher:", error)
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith("Missing required fields")) {
      const details = message.replace(/^Missing required fields:\s*/, "").split(", ")
      return NextResponse.json(
        { error: "Missing required fields", details },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: "Failed to update publisher", message },
      { status: 500 }
    )
  }
}
