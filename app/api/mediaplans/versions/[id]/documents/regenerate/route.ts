import { NextRequest, NextResponse } from "next/server"

import { requireRole } from "@/lib/requireRole"
import { regeneratePlanVersionDocuments } from "@/lib/docs/regeneratePlanVersionDocuments"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

/**
 * Rebuild MBA PDF / media plan / AA workbook from persisted published
 * version data. Admin only. File pointers only — never plan content.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const { id } = await params
    const versionId = Number(id)
    if (!id || !Number.isFinite(versionId) || versionId <= 0) {
      return NextResponse.json({ error: "Missing version id" }, { status: 400 })
    }

    let body: unknown = {}
    const contentType = request.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      try {
        body = await request.json()
      } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
      }
    }

    const record = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {}

    const result = await regeneratePlanVersionDocuments({
      versionId,
      kinds: record.kinds,
      force: Boolean(record.force),
    })

    if (result.status === "not_found") {
      return NextResponse.json({ error: "Version not found" }, { status: 404 })
    }
    if (result.status === "not_published") {
      return NextResponse.json({ code: "NOT_PUBLISHED" }, { status: 422 })
    }

    return NextResponse.json({ ok: true, results: result.results })
  } catch (error) {
    console.error("[api/mediaplans/versions/documents/regenerate POST]", error)
    return NextResponse.json({ error: "Failed to regenerate documents" }, { status: 500 })
  }
}
