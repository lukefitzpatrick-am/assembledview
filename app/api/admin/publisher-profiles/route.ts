import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { listPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles"

export const runtime = "nodejs"

/** Read-only publisher ingest profiles (MR config). No writes in this slice. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  try {
    const { profiles, source } = await listPublisherProfiles()
    return NextResponse.json({ profiles, source, editable: false })
  } catch (e) {
    console.error("[admin/publisher-profiles]", e)
    return NextResponse.json(
      { error: "Publisher profiles unavailable" },
      { status: 500 },
    )
  }
}
