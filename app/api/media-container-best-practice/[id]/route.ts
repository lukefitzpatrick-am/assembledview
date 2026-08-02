import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { updateMediaContainerBestPracticePostgresFirst } from "@/lib/data/writeMediaContainerBestPractice"
import { requireRole } from "@/lib/requireRole"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // SEC-G / SEC-10: writes are staff-only; keep audit stamp after the gate.
    const gate = await requireRole(req, ["admin"])
    if ("response" in gate) return gate.response

    const { id } = await params
    const body = (await req.json()) as Record<string, unknown>
    const currentUser = await getCurrentUser(req)
    const result = await updateMediaContainerBestPracticePostgresFirst(id, {
      ...body,
      _name: currentUser?.email ?? currentUser?.name ?? null,
    })
    if ("notFound" in result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ ...result.row, mirror: result.mirror })
  } catch (error) {
    console.error("Failed to update media-container best practice:", error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: "Failed to update media-container best practice", message },
      { status: 500 },
    )
  }
}
