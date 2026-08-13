import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { buildIngestReviewFromBuffer } from "@/lib/mediaplans/ingest/buildIngestReview"
import { listPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles"

export const runtime = "nodejs"

/** Upload a publisher schedule → review package (no writes). */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  try {
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 })
    }
    const buf = Buffer.from(await file.arrayBuffer())
    const { profiles } = await listPublisherProfiles()
    const review = await buildIngestReviewFromBuffer(buf, profiles, {
      skipAva: true,
    })
    return NextResponse.json({ review })
  } catch (e) {
    console.error("[admin/ingest/review]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Review failed" },
      { status: 500 },
    )
  }
}
