import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import {
  listUploadedAudiences,
  UploadedAudienceError,
} from "@/lib/planning/upload/uploadedAudienceRepo"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function repoError(error: unknown): NextResponse {
  if (error instanceof UploadedAudienceError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error("[api/planning/uploaded-audiences]", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

/**
 * GET /api/planning/uploaded-audiences?clients_id= — live uploaded audiences.
 * When clients_id is present, returns that client's rows PLUS clients_id null.
 */
export async function GET(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const raw = request.nextUrl.searchParams.get("clients_id")
    let clientsId: number | undefined
    if (raw != null && raw.trim() !== "") {
      const n = Number(raw)
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json(
          { error: "clients_id must be a positive number" },
          { status: 400 }
        )
      }
      clientsId = n
    }
    const rows = await listUploadedAudiences({ clientsId })
    return NextResponse.json(rows)
  } catch (error) {
    return repoError(error)
  }
}
