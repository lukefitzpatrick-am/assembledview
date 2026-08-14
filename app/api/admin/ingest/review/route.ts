import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { listPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles"
import { stageIngestReviewFromBuffer } from "@/lib/mediaplans/ingest/stageIngestReview"

export const runtime = "nodejs"

/** Upload a publisher schedule → staged review package (no plan writes). */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) {
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
    const pinnedPublisherName =
      String(form.get("publisherName") ?? "").trim() || null
    const uploadedBy =
      typeof auth.session?.user?.email === "string"
        ? auth.session.user.email.trim().toLowerCase()
        : null
    const { review, stageId, summary } = await stageIngestReviewFromBuffer(buf, {
      fileName: file.name,
      uploadedBy,
      profiles,
      pinnedPublisherName,
    })
    return NextResponse.json({ review, stageId, summary })
  } catch (e) {
    console.error("[admin/ingest/review]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Review failed" },
      { status: 500 },
    )
  }
}
